# Open native login compatibility patch

Open and Light retain their own login forms and use the original account backend and shared secure session cookie. Neither frontend should force navigation to the company membership login page.

The current Open upstream bundle `/assets/index-DeAaTMa3.js` has a login-only effect that redirects `open.beeeval.com` to the company login. A minimal public-server override removes only that effect. The patched bundle is served as `/assets/index-native-login-20261014.js`, and the Open HTTPS proxy substitutes that asset path in HTML. API routes, session enforcement and video protections remain proxied normally. The original nginx configuration was backed up before the validated reload.

This override is tied to the current upstream bundle filename. When Open is rebuilt, remove the redirect in its source Login component, then remove the temporary asset override and HTML substitution. Do not remove authentication to make the homepage accessible.

Cached-HTML compatibility: the original bundle URL `/assets/index-DeAaTMa3.js` also serves the patched bundle with `Cache-Control: no-store`. Proxy responses are marked no-store so refreshed HTML does not retain an obsolete login script. The new immutable asset URL is unchanged. Both asset URLs were checked for exact patched content and absence of the company-login redirect. Existing loaded browser tabs still need a full navigation.
