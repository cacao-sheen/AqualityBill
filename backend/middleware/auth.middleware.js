const supabase = require('../lib/supabase');

// Protect routes — verify Supabase session token
exports.protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: 'Not authorized to access this route' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }
};

// Authorize roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    const role = req.user?.user_metadata?.role || req.user?.role;
    if (!roles.includes(role)) {
      return res.status(403).json({
        message: `Not authorized to access this route`,
      });
    }
    next();
  };
};
