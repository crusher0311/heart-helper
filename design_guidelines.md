# Design Guidelines: Repair Order Search Tool

## Design Approach

**Selected Approach:** Design System with Productivity Tool Reference

This is a utility-focused, information-dense application optimized for speed and efficiency. Drawing inspiration from modern productivity tools like **Linear, Notion, and Airtable**, combined with **Material Design** principles for data-heavy interfaces.

**Core Principles:**
- **Clarity over decoration**: Every element serves a functional purpose
- **Scan-optimized**: Information hierarchy enables rapid scanning
- **Action-oriented**: Primary actions always visible and accessible
- **Data density**: Maximum information with minimal scrolling

---

## Typography System

**Font Families:**
- Primary: Inter (via Google Fonts)
- Monospace: JetBrains Mono (for part numbers, vehicle VINs, pricing)

**Hierarchy:**
- **Page Titles**: text-2xl font-semibold (Search interface, Results)
- **Section Headers**: text-lg font-semibold (Historical Jobs, Vehicle Details)
- **Card Titles**: text-base font-medium (Job names, repair order numbers)
- **Body Text**: text-sm (descriptions, notes, specifications)
- **Labels/Meta**: text-xs font-medium uppercase tracking-wide (field labels, status badges)
- **Pricing/Numbers**: text-base font-mono font-semibold (all monetary values, hours, quantities)

---

## Layout System

**Spacing Primitives:** Use Tailwind units of **2, 4, 6, 8, 12, 16** exclusively
- Tight spacing: p-2, gap-2 (within components)
- Standard spacing: p-4, gap-4 (cards, sections)
- Comfortable spacing: p-6, gap-6 (major sections)
- Large spacing: p-8, mb-12 (page margins, section breaks)

**Grid Structure:**
- Main search interface: Full-width container (max-w-7xl mx-auto px-4)
- Results layout: 3-column grid on desktop (similar to Carvis.ai reference)
  - Column 1 (25%): Search filters and vehicle input
  - Column 2 (40%): Search results list
  - Column 3 (35%): Selected job detail view
- Mobile: Single column stack with expandable sections

---

## Component Library

### 1. Navigation & Header
- **Top Navigation Bar**: Sticky header with app logo, search status indicator, user profile
- Height: h-16 with border-b
- Layout: Flex justify-between items-center px-6

### 2. Search Interface
- **Vehicle Input Form**: Prominent card with shadow-sm, rounded-lg, p-6
  - Fields: Year (dropdown), Make (searchable select), Model (searchable select), Engine (optional text)
  - Repair Type: Large text input with autocomplete suggestions
  - Search Button: Full-width, py-3, font-semibold
- **Quick Filters**: Chip-style buttons (rounded-full px-4 py-2 text-sm) for common searches
- **Advanced Filters**: Collapsible section with date range, mileage range, job categories

### 3. Results Display
- **Job Cards**: Compact cards (p-4 rounded-lg border hover:shadow-md transition)
  - Header: Vehicle year/make/model + repair order number
  - Job name in font-medium
  - Key metrics row: Labor hours | Parts count | Total cost
  - Date and mileage in text-xs
  - Status badge: rounded-full px-2 py-1 text-xs font-medium uppercase
- **Empty State**: Centered illustration with helpful search tips

### 4. Job Detail Panel
- **Sticky Panel**: Fixed or sticky positioning on right side
- **Sections:**
  - **Vehicle Summary**: Compact header with all vehicle specs
  - **Labor Breakdown**: Table format with labor description, hours, rate, total
  - **Parts List**: Detailed table with part number (monospace), description, quantity, cost, retail
  - **Totals Card**: Prominent summary with labor total, parts total, fees, taxes, grand total
  - **Actions**: Two primary buttons (Copy to Clipboard, Send to Tekmetric)

### 5. Data Tables
- **Structure**: Dense table with hover states on rows
- **Headers**: Sticky thead with font-medium text-xs uppercase
- **Cells**: py-2 px-4 text-sm, align numbers right
- **Zebra Striping**: Subtle alternating row treatment for scannability

### 6. Buttons & Actions
- **Primary Action**: Rounded-lg px-6 py-2.5 font-semibold
- **Secondary Action**: Border style with hover state
- **Icon Buttons**: w-10 h-10 rounded-lg for actions like copy, expand, filter
- **Button Groups**: gap-2 flex for related actions

### 7. Badges & Status Indicators
- **Status Badges**: Rounded-full px-3 py-1 text-xs font-bold uppercase
  - Posted, Completed, In Progress, Quoted states
- **AI Match Score**: Circular badge showing percentage match (e.g., "92% Match")

### 8. AI Intelligence Display
- **Match Confidence Indicator**: Progress bar or percentage badge
- **Suggestion Cards**: Similar to Carvis.ai, show "AI Recommended" section
- **Quick Stats**: Average labor time, typical parts cost, price range for similar jobs

---

## Specialized Features

### Chrome Extension Integration
- **Floating Action Button**: Fixed bottom-right, rounded-full, shadow-lg
- **Quick Capture Panel**: Slide-in drawer from right (w-96) with minimal vehicle input form

### Data Visualization
- **Cost Distribution**: Simple horizontal bar charts showing labor vs parts breakdown
- **Historical Trend**: Line chart showing price trends over time for recurring jobs
- Keep visualizations minimal and functional, not decorative

### Loading & Feedback States
- **Skeleton Screens**: Use for search results loading
- **Search Progress**: Linear progress bar at top of results panel
- **Success Toasts**: Top-right corner, auto-dismiss after 3s

---

## Responsive Behavior

**Desktop (1024px+)**: Three-column layout with sticky detail panel
**Tablet (768px-1023px)**: Two-column with collapsible detail panel
**Mobile (<768px)**: Single column, expandable cards, bottom sheet for details

---

## Images

**No hero images needed** - this is a utility application focused on data and function. Any imagery should be:
- **Empty states**: Simple line illustrations for "no results found"
- **Icons**: Use **Heroicons** (outline style) via CDN for actions, vehicle types, repair categories
- **Vehicle thumbnails**: If available from data, show small 64x64 thumbnails in results cards

---

## Accessibility

- Maintain minimum touch targets of 44x44px for all interactive elements
- Use semantic HTML for all data tables and forms
- ARIA labels for icon-only buttons
- Keyboard navigation for entire search and selection flow
- Focus indicators visible on all interactive elements (ring-2 ring-offset-2)