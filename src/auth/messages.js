export const accountMessages = {
  'inactive-profile': 'Your account is inactive. Contact an administrator to restore access.',
  'inactive-dealer': 'Your dealer organization is inactive. Contact an administrator to restore access.',
  incomplete: 'Your account setup is incomplete. Contact an administrator before continuing.',
};

export function authError(error) {
  const messages = {
    portal_config: 'Authentication is not configured. Add the public Supabase URL and publishable key to .env.local, then restart Vite.',
    invalid_credentials: 'Email or password is incorrect. Please try again.',
    email_not_confirmed: 'Confirm your email before logging in.',
    user_already_exists: 'An account already exists for this email. Please log in.',
    email_address_invalid: 'Enter a valid email address.',
    weak_password: 'Choose a stronger password with at least eight characters.',
    over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
    over_email_send_rate_limit: 'Email delivery is temporarily limited. Please try again later.',
    signup_disabled: 'Registration is currently unavailable. Please contact an administrator.',
  };
  return messages[error?.code] ?? 'We could not complete the request. Check your connection and try again.';
}
