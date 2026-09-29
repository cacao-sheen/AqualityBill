'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { Search, Trash2, X, FileDown, Droplets } from 'lucide-react'
import apiClient from '@/lib/axios'
import * as Dialog from '@radix-ui/react-dialog'
import { supabase } from '@/lib/supabase'
import { createReportDocument, drawSectionLabel, drawKeyValueRows, addReportFooter } from '@/lib/pdfReport'
import WaterDisconnectionPanel, { DisconnectionCandidate } from './WaterDisconnectionPanel'

type User = {
  _id: string
  name: string
  meterNo?: string
  email?: string
  address?: string
  mobile?: string
  gender?: string
  birthdate?: string
  createdAt?: string
  isActive: boolean
}

type ProfileRow = Record<string, any>

function mapProfileToUser(profile: ProfileRow): User {
  const firstName = String(profile.first_name ?? '').trim()
  const lastName = String(profile.last_name ?? '').trim()
  const formattedName =
    firstName && lastName
      ? `${lastName}, ${firstName}`
      : (lastName || firstName)

  return {
    _id: String(profile.id ?? profile.user_id ?? profile.profile_id ?? ''),
    name: formattedName || String(profile.name ?? profile.full_name ?? '—'),
    meterNo: profile.meter_no ?? undefined,
    email: profile.email ?? profile.contact_email ?? undefined,
    address: profile.address ?? profile.location ?? profile.barangay ?? undefined,
    mobile: profile.mobile ?? profile.phone ?? profile.phone_number ?? profile.contact_number ?? profile.contact_no ?? undefined,
    gender: profile.gender ?? profile.sex ?? undefined,
    birthdate: profile.birthdate ?? profile.birth_date ?? profile.date_of_birth ?? profile.dob ?? undefined,
    createdAt: profile.created_at ?? profile.createdAt ?? undefined,
    isActive: typeof profile.is_active === 'boolean'
      ? profile.is_active
      : String(profile.status ?? '').toLowerCase() !== 'inactive',
  }
}

function formatDisplayDate(value?: string) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [activeTab, setActiveTab] = useState<'all' | 'disconnection'>('all')
  const [disconnectionCandidates, setDisconnectionCandidates] = useState<DisconnectionCandidate[]>([])
  const [disconnectionLoading, setDisconnectionLoading] = useState(true)
  const [disconnectionError, setDisconnectionError] = useState<string | null>(null)

  async function fetchDisconnectionCandidates() {
    setDisconnectionLoading(true)
    try {
      const res = await apiClient.get('/disconnections')
      setDisconnectionCandidates(res.data?.data ?? [])
      setDisconnectionError(null)
    } catch (fetchError: any) {
      setDisconnectionCandidates([])
      setDisconnectionError(fetchError?.response?.data?.message || fetchError?.message || 'Failed to load overdue consumers.')
    } finally {
      setDisconnectionLoading(false)
    }
  }

  function updateDisconnectionStatus(consumerId: string, status: 'connected' | 'disconnected') {
    setDisconnectionCandidates((prev) =>
      prev.map((c) => (c.consumer_id === consumerId ? { ...c, connection_status: status } : c))
    )
  }

  async function fetchConsumers() {
    setLoading(true)
    try {
      const res = await apiClient.get('/users')
      const rawProfiles: ProfileRow[] = res.data?.data ?? []
      setUsers(rawProfiles.map(mapProfileToUser).filter((profile) => profile._id))
      setError(null)
    } catch (fetchError: any) {
      setUsers([])
      setError(fetchError?.response?.data?.message || fetchError?.message || 'Failed to load consumers.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConsumers()
    fetchDisconnectionCandidates()
  }, [])

  function openDeleteDialog(id: string) {
    setPendingDeleteId(id)
    setDeletePassword('')
    setDeleteModalOpen(true)
    setError(null)
  }

  async function confirmDeleteUser() {
    if (!pendingDeleteId) return
    if (!deletePassword.trim()) {
      setError('Admin password is required to delete a consumer.')
      return
    }

    setDeleteLoading(true)

    const {
      data: { user: currentUser },
      error: currentUserError,
    } = await supabase.auth.getUser()

    if (currentUserError || !currentUser?.email) {
      setError('Unable to verify current admin account. Please log in again.')
      setDeleteLoading(false)
      return
    }

    const { data: verifiedSession, error: verifyError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: deletePassword.trim(),
    })

    if (verifyError || verifiedSession.user?.user_metadata?.role !== 'admin') {
      setError('Invalid admin password. Deletion cancelled.')
      setDeleteLoading(false)
      return
    }

    const previous = users
    setUsers((prev) => prev.filter((u) => u._id !== pendingDeleteId))
    try {
      await apiClient.delete(`/users/${pendingDeleteId}`)
      setError(null)
      setDeleteModalOpen(false)
      setPendingDeleteId(null)
      setDeletePassword('')
    } catch (deleteError: any) {
      setUsers(previous)
      setError(deleteError?.response?.data?.message || deleteError?.message || 'Failed to delete consumer.')
    } finally {
      setDeleteLoading(false)
    }
  }

  function downloadConsumerPdf(user: User) {
    const { doc, cursorY } = createReportDocument({
      title: 'Consumer Profile Summary',
      subtitle: 'AqualityBill Admin',
    })

    let y = drawSectionLabel(doc, 'Consumer Details', cursorY)
    y = drawKeyValueRows(doc, [
      ['Meter No.:', user.meterNo || '—'],
      ['Name:', user.name || '—'],
      ['Address:', user.address || '—'],
      ['Mobile:', user.mobile || '—'],
      ['Gender:', user.gender || '—'],
      ['Birthdate:', formatDisplayDate(user.birthdate)],
      ['Account Status:', user.isActive ? 'Active' : 'Inactive'],
      ['Created At:', formatDisplayDate(user.createdAt)],
    ], y)

    addReportFooter(doc, 'This is a system-generated document for administrative review.')
    const safeName = (user.name || 'consumer').replace(/[^a-z0-9-_]+/gi, '_')
    doc.save(`consumer_${safeName}.pdf`)
  }

  const filteredUsers = users
    .filter((u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.meterNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.mobile?.includes(searchQuery) ||
      u.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.gender?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Consumer List</h2>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 border border-slate-200 hover:bg-slate-100 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-800'
            }`}
          >
            All Consumers
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('disconnection')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'disconnection'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 border border-slate-200 hover:bg-slate-100 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-800'
            }`}
          >
            <Droplets className="h-4 w-4" />
            Water Disconnection
            {disconnectionCandidates.length > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  activeTab === 'disconnection'
                    ? 'bg-white/20 text-inherit'
                    : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                }`}
              >
                {disconnectionCandidates.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'disconnection' ? (
          <WaterDisconnectionPanel
            candidates={disconnectionCandidates}
            loading={disconnectionLoading}
            error={disconnectionError}
            onStatusChange={updateDisconnectionStatus}
          />
        ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Manage Consumers</h3>
          </div>

          <div className="p-5 border-b border-slate-200 dark:border-slate-800">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search consumers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">Loading consumers...</div>
            ) : error ? (
              <div className="p-8 text-center text-sm text-red-500 dark:text-red-400">{error}</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">
                {searchQuery ? 'No consumers found matching your search.' : 'No consumers found.'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Address</th>
                    <th className="px-5 py-3">Mobile</th>
                    <th className="px-5 py-3">Gender</th>
                    <th className="px-5 py-3">Birthdate</th>
                    <th className="px-5 py-3 text-center">Account Status</th>
                    <th className="px-5 py-3">Created At</th>
                    <th className="px-5 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((user) => (
                    <tr key={user._id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                        <p className="text-[11px] font-mono font-normal text-slate-400 dark:text-slate-500 leading-tight">
                          Meter #{user.meterNo ?? '—'}
                        </p>
                        {user.name}
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{user.address || '—'}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{user.mobile || '—'}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300 capitalize">{user.gender || '—'}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{formatDisplayDate(user.birthdate)}</td>
                      <td className="px-5 py-3 text-center">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${
                            user.isActive
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {user.isActive ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{formatDisplayDate(user.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            title="Download consumer PDF"
                            onClick={() => downloadConsumerPdf(user)}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10 transition-colors"
                          >
                            <FileDown className="h-4 w-4" />
                          </button>
                          <button
                            title="Delete consumer"
                            onClick={() => openDeleteDialog(user._id)}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!loading && filteredUsers.length > 0 && (
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2">
              <button
                disabled
                className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-400 dark:text-slate-500 cursor-not-allowed"
              >
                Previous
              </button>
              <button className="h-9 w-9 rounded-lg bg-slate-900 text-white text-sm font-medium">
                1
              </button>
              <button
                disabled
                className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-400 dark:text-slate-500 cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
        )}

        <Dialog.Root open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 w-full max-w-md z-50">
              <div className="flex items-center justify-between mb-4">
                <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Confirm Delete
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close dialog"
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </Dialog.Close>
              </div>

              <Dialog.Description className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                Are you sure you want to delete this consumer? This action cannot be undone.
              </Dialog.Description>

              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
                  Admin Password
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={confirmDeleteUser}
                  className="h-10 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {deleteLoading ? 'Deleting...' : 'Delete Consumer'}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

    </AppShell>
  )
}
