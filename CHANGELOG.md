# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **`list_reference`**: lists the values of a reference model with their IDs (users, teams, companies, currencies, sources, lead statuses, opportunity statuses and types, lost reasons, payment conditions and modes), so `create_lead`, `create_opportunity` and `create_sale_order` no longer need IDs to be guessed. A model missing from the instance returns an actionable error instead of failing.
- **`search_sale_order_lines`**: searches quote and order lines by product, client, salesperson and period, with a `scope` of confirmed orders (filtered on order date), quotes (filtered on creation date) or both. Each line carries the client and order IDs to chain with `get_partner` / `get_sale_order`.
- **`search_contacts`**: lists a company's contacts (Partner with `isContact`, linked through `mainPartner`), with job title, department, phones and email; filters by company name or ID and by contact name, email or phone. Archived contacts are excluded. `client_review` now lists the client's contacts.
- **`get_product`**: product sheet by ID or code, returned as a readable summary instead of raw JSON: type, family, category, unit, sale, cost, purchase and average prices, and the unit margin computed on cost price (amount, margin rate, coefficient). HTML descriptions are converted to plain text.
- **`client_review` and `weekly_sales_review` prompts**: guided client summary and weekly sales review built from the existing tools.
- New tools declare the MCP `readOnlyHint` annotation.

### Changed

- **`search_partners`**: `query` now also matches the partner reference, email and phones, and becomes optional to list every partner of a type. Adds `limit` / `offset` pagination.
- **`search_leads`**: new filters on creation date and contact date, and `limit` / `offset` pagination.
- **`search_opportunities`**: new filters on sales stage (`statusName`), amount range and expected close date, and `limit` / `offset` pagination.
- **`weekly_sales_review` prompt**: uses the new close-date and contact-date filters to find overdue opportunities and leads.
- The three search tools above declare the `readOnlyHint` annotation.

## [1.0.5] - 2026-10-24

### Added

- **`render_diagram`**: renders a Mermaid-syntax diagram to a self-contained SVG with the [Pele](https://pele.run/) library. Rendering happens server-side, so dashboard artifacts don't depend on a CDN script that may be blocked. The tool description holds a catalog of every Pele diagram type with when to use it on Axelor data (`pie`, `xychart`, `sankey`, `treemap-beta`, `gantt`, `timeline`, `kanban`…), the types kept out of dashboards, and syntax pitfalls found while testing (quoted `xychart` labels, quoted `sankey` names containing a comma). A syntax error returns the faulty line so the source can be fixed.

### Changed

- **`dashboard_guidelines` prompt**: every summary dashboard now includes at least one Pele diagram, picked from the `render_diagram` catalog.
- **Dependencies**: refreshed, including `@modelcontextprotocol/sdk` 1.32.2.

### Security

- **`zod` upgraded to 4.6.7** ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)): earlier versions could exhaust memory while validating oversized constrained collections. No 3.x release is patched. The MCP SDK supports zod v4 and the tool input schemas sent to the client are unchanged.

### Documentation

- README: refreshed Claude Desktop setup and added the Claude Code restart step.

## [1.0.4] - 2026-10-05

### Added

- **`analyze_unbilled_time`**: unbilled time (work in progress). Timesheet lines to invoice that are not invoiced yet, in hours and valued excl. tax (sales and cost), grouped by project, client, team or employee.
- **`search_timesheet_lines`**: detailed list of timesheet lines (date, employee, project, task, activity, hours, comment, invoicing status and valuation), with pagination.
- **`dashboard_guidelines` prompt**: first MCP prompt of the server. Generic guidelines to build reliable dashboards from Axelor data (which tools to use for each indicator, explicit periods, excl. tax amounts, no invented figures, methodology note), with an optional description of the requested dashboard.

### Changed

- **`summary_timesheet_by_project`**: new `statusSelect` filter. By default, lines from refused and cancelled timesheets are no longer counted.
- **Timesheet fields**: `search_timesheets` now returns `timeLoggingPreferenceSelect`, and timesheet lines include the employee, activity, extra hours flag, invoicing fields and valuation.
- **`get_timesheet`**: its description now points to `search_timesheet_lines` for the detail of the logged lines.

### Fixed

- **`summary_timesheet_by_project` (groupBy employee)**: every hour ended up under "Non assigné", because the employee was read from a nested path the API does not return. It is now read from the line's own `employee` field.
- **`summary_timesheet_by_project` (groupBy employee)**: the "Projets concernés" column listed tasks instead of projects.
- **`search_timesheets`**: the cancelled status (5) can now be used as a filter.

### Documentation

- README: examples for the new timesheet tools and the dashboard guidelines prompt.
- `axelor-analyser` skill: verified `TimesheetLine` model (durations, invoicing fields, unbilled time definition) and timesheet statuses.

## [1.0.3] - 2026-10-05

### Fixed

- **`search_sale_orders`**: the `deliveryState` and `invoicingState` filters sent 0/1/2 while AOS codes these states 1/2/3, so `deliveryState: not_delivered` returned no order at all. Contributed by Georges Carlos.
- **Relation labels**: the REST API returns only the target model's name column for a many-to-one, which is `fullName` for `User`, `Project`, `ProjectTask` and `Product` too, not just `Partner`. Grouping by salesperson or assignee put everything under "non assigné", and timesheet, task and traceback labels were empty. A shared `refName()` helper now reads every relation label. Contributed by Georges Carlos.

### Documentation

- `axelor-analyser` skill: delivery and invoicing states start at 1, and the list of models whose relations return `fullName`.

## [1.0.2] - 2026-10-05

### Changed

- **TypeScript** upgraded from 6.0.3 to 7.0.2.
- **`@types/node`** upgraded from ^20 to ^24, to match the Node.js 24 LTS runtime required by the README.
- **`tsx`** upgraded from 4.21.0 to 4.23.15.

## [1.0.1] - 2026-10-05

### Added

- **`analyze_invoices`**: new invoicing analysis tool. Net revenue (invoices minus credit notes) excl./incl. tax and remaining due, grouped by month, client, team or status. The team comes from the origin sale order, falling back to the project's team.
- **`analyze_sales`**: new `team` grouping axis and `teamName` filter.

### Changed

- **`search_invoices`**: now also returns `operationSubTypeSelect` (advance payment invoices), `purchaseOrder`, `originalInvoice` (origin invoice of a credit note), `supplierInvoiceNb` and `companyExTaxTotal`.

### Fixed

- **Projects, leads, opportunities, job positions, tracebacks**: the "not archived" filter excluded records whose `archived` flag is `NULL`, i.e. almost all of them. `search_projects` and `analyze_projects` returned only 1 or 2 projects regardless of the filters.
- **`analyze_sales` and `analyze_projects` (groupBy client)**: every record ended up in a single "inconnu" / "sans client" group. The partner name is now read from `fullName`.

### Documentation

- README: update procedure and documentation of the new tools.
- `axelor-analyser` skill: relation rules (namecolumn), the nullable `archived` pitfall, the `Team` model, `Project` and `Invoice` trees.

## [1.0.0] - 2026-08-25

### Added

- **Partners**: `search_partners`, `get_partner`
- **Products**: `search_products`, `analyze_products`
- **Sales**: `search_sale_orders`, `get_sale_order`, `create_sale_order`, `analyze_sales`
- **CRM leads**: `search_leads`, `get_lead`, `create_lead`
- **CRM opportunities**: `search_opportunities`, `get_opportunity`, `create_opportunity`, `analyze_opportunities`
- **Invoices**: `search_invoices`, `get_invoice`
- **Accounting**: `search_move_lines` (read-only)
- **Projects**: `search_projects`, `analyze_projects`, `get_project_tasks_summary`
- **Timesheets**: `search_timesheets`, `get_timesheet`, `summary_timesheet_by_project`
- **HR**: `search_job_positions`, `get_job_position`, `create_job_position`
- **Error logs**: `search_tracebacks`, `get_traceback`, `analyze_tracebacks`
- Confirmation guard on all `create_*` tools: a preview is returned first, and the record is only created when the tool is called again with `confirm=true`.
