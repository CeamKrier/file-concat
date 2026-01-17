---
name: accessibility
description: Implement web accessibility (a11y) patterns including ARIA attributes, keyboard navigation, focus management, and screen reader support. Use for any UI component or interactive element.
---

# Accessibility (a11y)

## When to Use This Skill

Use when:
- Building interactive components (modals, dropdowns, tabs)
- Implementing keyboard navigation
- Adding screen reader support
- Ensuring color contrast compliance

## Semantic HTML First

```tsx
// ❌ Non-semantic
<div onClick={handleClick}>Click me</div>

// ✅ Semantic
<button onClick={handleClick}>Click me</button>
```

## ARIA Attributes

### Common ARIA Patterns

```tsx
// Button with loading state
<button
  aria-busy={isLoading}
  aria-disabled={isLoading}
>
  {isLoading ? 'Loading...' : 'Submit'}
</button>

// Expandable section
<button
  aria-expanded={isOpen}
  aria-controls="panel-1"
>
  Toggle Panel
</button>
<div id="panel-1" hidden={!isOpen}>
  Panel content
</div>

// Live regions (for dynamic updates)
<div aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>
```

### Dialog/Modal Pattern

```tsx
function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      modalRef.current?.focus();
    }
  }, [isOpen]);

  return isOpen ? (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabIndex={-1}
    >
      <h2 id="modal-title">{title}</h2>
      {children}
      <button onClick={onClose}>Close</button>
    </div>
  ) : null;
}
```

## Keyboard Navigation

### Focus Trap for Modals

```tsx
function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive) return;

    const container = containerRef.current;
    if (!container) return;

    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();

    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  return containerRef;
}
```

### Arrow Key Navigation

```tsx
function useArrowNavigation(items: HTMLElement[]) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const currentIndex = items.findIndex(
      item => item === document.activeElement
    );

    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % items.length;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + items.length) % items.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    items[nextIndex]?.focus();
  }, [items]);

  return handleKeyDown;
}
```

## Focus Management

```tsx
// Skip link pattern
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to main content
</a>

// Focus visible styling (Tailwind)
<button className="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
  Click me
</button>
```

## Screen Reader Only Content

```css
/* Tailwind: sr-only */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

```tsx
<button>
  <Icon name="trash" />
  <span className="sr-only">Delete item</span>
</button>
```

## Color Contrast

- **Normal text**: 4.5:1 contrast ratio minimum
- **Large text (18px+)**: 3:1 contrast ratio minimum
- **UI components**: 3:1 contrast ratio minimum

## Accessibility Checklist

- [ ] All interactive elements are keyboard accessible
- [ ] Focus order is logical and visible
- [ ] Images have alt text (or alt="" for decorative)
- [ ] Form inputs have associated labels
- [ ] Color is not the only way to convey information
- [ ] Modals trap focus and can be closed with Escape
- [ ] Dynamic content updates are announced to screen readers
