'use client';

// The console's navigation.
//
// It replaces a single row of fourteen flat links, which had two problems: on a
// laptop it was a wall of equally-weighted words with no sense of what belonged
// with what, and on a phone it wrapped into four lines of tap targets before
// any content appeared.
//
// The fix is grouping by the job rather than by the screen. Six things people
// reach for daily stay at the top level; everything that is configured once and
// then left alone lives behind one "Einstellungen" menu. Below 900px the whole
// thing folds into one button.
//
// This is a client component only because the current page has to be known —
// highlighting where you are is most of what makes a menu navigable. The links
// themselves are decided on the server from the caller's permissions and passed
// in already filtered, so nothing about who may see what is decided here.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export interface NavItem {
  href: string;
  label: string;
}

export interface NavEntry {
  /** A single destination, or a menu heading when `items` is present. */
  label: string;
  href?: string;
  items?: NavItem[];
}

/**
 * Is `href` the page we are on?
 *
 * A prefix match, so /admin/bookings/123 still lights up "Buchungen" — but
 * anchored on a segment boundary, otherwise /admin/booking-templates would
 * match /admin/bookings. /admin itself is exact, or it would match everything.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ entries }: { entries: NavEntry[] }) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  // Navigating is the end of the interaction: leaving a menu hanging open over
  // the page you just landed on is the classic bug in this pattern.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!openMenu) return;

    function onPointerDown(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMenu(null);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  return (
    <div className="navbar" ref={navRef}>
      <div style={{ padding: '0 var(--s4)' }}>
        <button
          type="button"
          className="navlink navtoggle"
          aria-expanded={mobileOpen}
          aria-controls="admin-nav-items"
          onClick={() => setMobileOpen((v) => !v)}
          style={{ margin: 'var(--s2) 0' }}
        >
          <span aria-hidden="true">{mobileOpen ? '✕' : '☰'}</span> Menü
        </button>
      </div>

      <div
        id="admin-nav-items"
        className={`navbar__inner${mobileOpen ? ' navbar__inner--open' : ''}`}
      >
        {entries.map((entry) => {
          if (entry.href && !entry.items) {
            const active = isActive(pathname, entry.href);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className="navlink"
                aria-current={active ? 'page' : undefined}
              >
                {entry.label}
              </Link>
            );
          }

          const items = entry.items ?? [];
          if (items.length === 0) return null;

          // A menu counts as current when any page inside it is — otherwise a
          // whole section of the app would look unvisited while you are in it.
          const sectionActive = items.some((i) => isActive(pathname, i.href));
          const open = openMenu === entry.label;

          return (
            <div className="navmenu" key={entry.label}>
              <button
                type="button"
                className={`navlink${sectionActive ? ' navlink--active' : ''}`}
                aria-expanded={open}
                onClick={() => setOpenMenu(open ? null : entry.label)}
              >
                {entry.label}
                <span className="navlink__caret" aria-hidden="true">
                  ▾
                </span>
              </button>

              {/* On a phone the panel is a static section of the open menu, so
                  it is always rendered there; on a laptop it is a dropdown and
                  only exists while open. The CSS decides which. */}
              {(open || mobileOpen) && (
                <div className="navmenu__panel">
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="navmenu__item"
                      aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
