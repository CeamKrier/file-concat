---
name: security-hardening
description: Implement client-side security measures including Content Security Policy, input sanitization, XSS prevention, and secure data handling. Use when handling user input, displaying dynamic content, or storing sensitive data.
---

# Security Hardening

## When to Use This Skill

Use when:
- Handling user-generated content
- Storing sensitive data client-side
- Embedding external content
- Implementing authentication flows

## XSS Prevention

### Never Use dangerouslySetInnerHTML Unsafely

```tsx
// ❌ Dangerous
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// ✅ Safe - use a sanitizer
import DOMPurify from 'dompurify';

<div
  dangerouslySetInnerHTML={{
    __html: DOMPurify.sanitize(userContent)
  }}
/>
```

### Sanitize with DOMPurify

```typescript
import DOMPurify from 'dompurify';

// Basic sanitization
const clean = DOMPurify.sanitize(dirty);

// Allow specific tags only
const cleanStrict = DOMPurify.sanitize(dirty, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
  ALLOWED_ATTR: ['href']
});

// Remove all HTML
const textOnly = DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [] });
```

## Content Security Policy (CSP)

### Meta Tag CSP

```html
<meta
  http-equiv="Content-Security-Policy"
  content="
    default-src 'self';
    script-src 'self' 'unsafe-inline';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    font-src 'self';
    connect-src 'self' https://api.example.com;
  "
>
```

### Common CSP Directives

| Directive | Purpose |
|-----------|---------|
| `default-src` | Fallback for other directives |
| `script-src` | JavaScript sources |
| `style-src` | CSS sources |
| `img-src` | Image sources |
| `connect-src` | XHR, WebSocket, fetch |
| `frame-src` | iframe sources |

## Secure Data Storage

### Sensitive Data Handling

```typescript
// ❌ Don't store sensitive data in localStorage
localStorage.setItem('token', secretToken);

// ✅ Use sessionStorage for session-bound data
sessionStorage.setItem('token', secretToken);

// ✅ Better: Use httpOnly cookies (server-set)
// ✅ Best: Don't store on client if possible
```

### Encrypt Before Storing (if necessary)

```typescript
// Using SubtleCrypto API
async function encrypt(data: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return btoa(
    String.fromCharCode(...iv) +
    String.fromCharCode(...new Uint8Array(encrypted))
  );
}
```

## URL Handling

### Validate URLs

```typescript
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// ❌ Don't allow javascript: URLs
function sanitizeHref(href: string): string {
  if (href.toLowerCase().startsWith('javascript:')) {
    return '#';
  }
  return href;
}
```

### Open External Links Safely

```tsx
<a
  href={externalUrl}
  target="_blank"
  rel="noopener noreferrer"  // Prevents window.opener attacks
>
  External Link
</a>
```

## Input Validation

```typescript
// Validate on both client AND server
function validateEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

// Limit input length
<input
  type="text"
  maxLength={100}
  value={value}
  onChange={(e) => setValue(e.target.value.slice(0, 100))}
/>
```

## Iframe Security

```tsx
// Sandbox iframes
<iframe
  src={externalContent}
  sandbox="allow-scripts allow-same-origin"
  referrerPolicy="no-referrer"
/>
```

## Subresource Integrity

```html
<script
  src="https://cdn.example.com/library.js"
  integrity="sha384-abc123..."
  crossorigin="anonymous"
></script>
```

## Security Checklist

- [ ] Sanitize all user-generated HTML content
- [ ] Validate URLs before using
- [ ] Use `rel="noopener noreferrer"` on external links
- [ ] Implement CSP headers/meta tags
- [ ] Never store secrets in client code
- [ ] Use HTTPS only
- [ ] Validate all inputs client-side AND server-side
- [ ] Sandbox iframes from untrusted sources
