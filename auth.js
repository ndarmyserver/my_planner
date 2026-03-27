/* ═══════════════════════════════════════════════
   AUTHENTICATION
   ═══════════════════════════════════════════════ */

const AppAuth = {
  currentUser: null,

  init() {
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submitBtn = loginForm.querySelector('.login-form__btn');

      loginError.hidden = true;
      loginError.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in…';

      try {
        await AppAuth.login(email, password);
      } catch (err) {
        loginError.textContent = AppAuth._friendlyError(err.code);
        loginError.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log in with email';
      }
    });

    auth.onAuthStateChanged(user => {
      AppAuth.currentUser = user;
      if (user) {
        AppAuth._onLogin(user);
      } else {
        AppAuth._onLogout();
      }
    });
  },

  login(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
  },

  logout() {
    return auth.signOut();
  },

  _onLogin(user) {
    // Hide login screen, show app
    document.getElementById('login-screen').hidden = true;
    document.querySelector('.app-shell').style.display = '';

    // Update email in workspace menu
    const emailEl = document.querySelector('.workspace-menu__email');
    if (emailEl) emailEl.textContent = user.email;

    // Reset login form
    const loginForm = document.getElementById('login-form');
    loginForm.reset();
    document.getElementById('login-error').hidden = true;
    const submitBtn = loginForm.querySelector('.login-form__btn');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log in with email';

    // Notify app
    if (typeof onAuthReady === 'function') onAuthReady(user.uid);
  },

  _onLogout() {
    // Show login screen, hide app
    document.getElementById('login-screen').hidden = false;
    document.querySelector('.app-shell').style.display = 'none';

    // Also hide settings view if open
    const settingsView = document.getElementById('settings-view');
    if (settingsView) settingsView.hidden = true;

    // Notify app
    if (typeof onAuthClear === 'function') onAuthClear();
  },

  _friendlyError(code) {
    switch (code) {
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
};
