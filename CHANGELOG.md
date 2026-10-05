# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This project adheres to [Semantic Versioning](https://semver.org/).

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
