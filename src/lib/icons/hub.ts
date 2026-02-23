/**
 * Custom "hub" icon pack for common infrastructure components.
 * Usage in architecture-beta: hub:service, hub:vps, hub:firewall, etc.
 *
 * Icons follow Lucide conventions: 24x24 viewBox, stroke-based, 2px stroke width.
 */
import type { IconifyJSON } from '@iconify/types';

export const hubIcons: IconifyJSON = {
  prefix: 'hub',
  width: 24,
  height: 24,
  icons: {
    /** Containerized service (app in Docker) */
    service: {
      body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="M2 8h20"/>
        <circle cx="5" cy="6" r=".75" fill="currentColor" stroke="none"/>
        <circle cx="7.5" cy="6" r=".75" fill="currentColor" stroke="none"/>
        <circle cx="10" cy="6" r=".75" fill="currentColor" stroke="none"/>
        <path d="M9 14l-2 2 2 2"/>
        <path d="M15 14l2 2-2 2"/>
      </g>`,
    },

    /** Virtual Private Server */
    vps: {
      body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <rect x="3" y="2" width="18" height="9" rx="2"/>
        <rect x="3" y="13" width="18" height="9" rx="2"/>
        <circle cx="7" cy="6.5" r="1" fill="currentColor"/>
        <path d="M11 6.5h6"/>
        <circle cx="7" cy="17.5" r="1" fill="currentColor"/>
        <path d="M11 17.5h6"/>
      </g>`,
    },

    /** Firewall / network security */
    firewall: {
      body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <path d="M12 2L4 6v5c0 5.25 3.44 10.18 8 11.36 4.56-1.18 8-6.11 8-11.36V6l-8-4z"/>
        <path d="M7.5 10h9"/>
        <path d="M7.5 14h9"/>
        <path d="M12 10v4"/>
        <path d="M9.5 14v4"/>
        <path d="M14.5 6v4"/>
      </g>`,
    },

    /** Load balancer / traffic distributor */
    loadbalancer: {
      body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <circle cx="12" cy="5" r="3"/>
        <circle cx="5" cy="19" r="3"/>
        <circle cx="19" cy="19" r="3"/>
        <path d="M10.2 7.4L6.8 16.2"/>
        <path d="M13.8 7.4l3.4 8.8"/>
        <path d="M8 19h8"/>
      </g>`,
    },

    /** Message queue */
    queue: {
      body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <rect x="1" y="6" width="6" height="12" rx="1"/>
        <rect x="9" y="6" width="6" height="12" rx="1"/>
        <rect x="17" y="6" width="6" height="12" rx="1"/>
        <path d="M4 3v3M12 3v3M20 3v3"/>
        <path d="M4 18v3M12 18v3M20 18v3"/>
      </g>`,
    },

    /** Network / internet / globe */
    network: {
      body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M2 12h20"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </g>`,
    },

    /** API endpoint / webhook */
    api: {
      body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <path d="M4 7h4v10H4z"/>
        <path d="M14 7h4v4h-4z"/>
        <path d="M14 15h4v2h-4z"/>
        <path d="M8 12h6"/>
        <path d="M8 7h6"/>
        <path d="M10 3v4M10 17v4"/>
      </g>`,
    },

    /** Storage bucket / object store */
    bucket: {
      body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <ellipse cx="12" cy="5" rx="8" ry="3"/>
        <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/>
        <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/>
      </g>`,
    },

    /** Monitoring / observability */
    monitoring: {
      body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M6 13l3-4 3 2 4-5"/>
        <path d="M2 17h20v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2z"/>
        <circle cx="12" cy="19" r=".5" fill="currentColor" stroke="none"/>
      </g>`,
    },
  },
};
