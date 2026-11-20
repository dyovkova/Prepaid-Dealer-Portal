export function validateAuthForm(form) {
  for (const input of form.querySelectorAll('[data-trim]')) {
    input.value = input.value.trim();
    input.setCustomValidity(input.value ? '' : 'Enter a nonblank name.');
  }
  const confirmation = form.elements.namedItem('password-confirm');
  if (confirmation) confirmation.setCustomValidity(
    confirmation.value === form.elements.namedItem('password').value ? '' : 'Passwords must match.',
  );
  form.classList.add('was-validated');
  const valid = form.checkValidity();
  if (!valid) form.querySelector('input:invalid')?.focus();
  return valid;
}
