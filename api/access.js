// ❗ TEMP: This object resets when Vercel redeploys or scales.
// Replace with a database for production.
let userAccess = {};

export default function handler(req, res) {
  const {
    query: { email },
  } = req;

  if (!email) {
    return res.status(400).json({ error: 'Email parameter is required' });
  }

  const access = userAccess[email] || 'No access assigned';
  res.status(200).json({ email, access });
}

// Optional helper so other routes (like webhook) can update the object
export function setUserAccess(email, tier) {
  userAccess[email] = tier;
}
