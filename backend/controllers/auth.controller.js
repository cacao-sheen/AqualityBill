const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const supabase = require('../lib/supabase');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// Register user
exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const { data: user, error } = await supabase
      .from('users')
      .insert({ name, email, password: hashedPassword, role: role || 'user', is_active: true })
      .select('id, name, email, role')
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      token: generateToken(user.id),
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, role, password')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { password: _pw, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      token: generateToken(user.id),
      user: userWithoutPassword,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Logout (stateless JWT)
exports.logout = async (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};
