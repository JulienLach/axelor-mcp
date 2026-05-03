import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CLASSES, INVOICE_FIELDS, LEAD_FIELDS, OPPORTUNITY_FIELDS, PARTNER_FIELDS, PRODUCT_FIELDS, SALE_ANALYSIS_FIELDS, SALE_ORDER_FIELDS, SALE_ORDER_LINE_FIELDS } from "./fields.ts";

const BASE_URL = process.env.AXELOR_BASE_URL;
let sessionCookie = "";

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getSessionCookie(): Promise<string> {
    const res = await fetch(`${BASE_URL}/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: process.env.AXELOR_USERNAME,
            password: process.env.AXELOR_PASSWORD,
        }),
    });
    if (!res.ok) throw new Error(`Axelor login failed: ${res.status} — ${await res.text()}`);
    return res.headers.get("set-cookie") ?? "";
}

async function axelorFetch(path: string, options: RequestInit): Promise<Response> {
    if (!sessionCookie) sessionCookie = await getSessionCookie();
    const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", Cookie: sessionCookie, ...options.headers },
    });
    if (res.status === 401) {
        console.error("Session expirée, re-authentification...");
        sessionCookie = await getSessionCookie();
        return fetch(`${BASE_URL}${path}`, {
            ...options,
            headers: { "Content-Type": "application/json", Cookie: sessionCookie, ...options.headers },
        });
    }
    return res;
}

// ── Helpers génériques ────────────────────────────────────────────────────────

type Criterion = { fieldName: string; operator: string; value: unknown } | { operator: "and" | "or"; criteria: Criterion[] };

async function axelorSearch(
    className: string,
    fields: string[],
    criteria: Criterion[],
    options: { limit?: number; offset?: number; sortBy?: string[] } = {},
): Promise<{ data: unknown[]; total: number }> {
    const res = await axelorFetch(`/ws/rest/${className}/search`, {
        method: "POST",
        body: JSON.stringify({
            offset: options.offset ?? 0,
            limit: options.limit ?? 20,
            fields,
            sortBy: options.sortBy,
            data: { criteria, operator: "and" },
        }),
    });
    if (!res.ok) throw new Error(`Axelor search failed (${className}): ${res.status}`);
    const json = (await res.json()) as { data?: unknown[]; total?: number };
    return { data: json.data ?? [], total: json.total ?? 0 };
}

async function axelorGetById(className: string, id: number): Promise<unknown | null> {
    const res = await axelorFetch(`/ws/rest/${className}/${id}`, { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Axelor get failed (${className}/${id}): ${res.status}`);
    const json = (await res.json()) as { data?: unknown[] };
    return json.data?.[0] ?? null;
}

function formatResult(label: string, data: unknown[], total: number): string {
    if (data.length === 0) return `Aucun ${label} trouvé.`;
    return `${data.length} résultat(s) sur ${total} au total :\n\n${JSON.stringify(data, null, 2)}`;
}

function text(content: string) {
    return { content: [{ type: "text" as const, text: content }] };
}

// ── Serveur MCP ───────────────────────────────────────────────────────────────

const server = new McpServer({ name: "axelor-mcp", version: "1.1.0" });

// ── Partenaires ───────────────────────────────────────────────────────────────

server.registerTool(
    "search_partners",
    {
        description: "Rechercher des partenaires (clients, fournisseurs, prospects, contacts) dans Axelor par nom ou référence",
        inputSchema: {
            query: z.string().describe("Nom ou référence du partenaire"),
            type: z
                .enum(["all", "customer", "supplier", "prospect", "contact"])
                .optional()
                .describe("Filtrer par type : all (défaut), customer, supplier, prospect, contact"),
        },
    },
    async ({ query, type = "all" }) => {
        const criteria: Criterion[] = [{ fieldName: "name", operator: "like", value: `%${query}%` }];
        if (type === "customer") criteria.push({ fieldName: "isCustomer", operator: "=", value: true });
        if (type === "supplier") criteria.push({ fieldName: "isSupplier", operator: "=", value: true });
        if (type === "prospect") criteria.push({ fieldName: "isProspect", operator: "=", value: true });
        if (type === "contact") criteria.push({ fieldName: "isContact", operator: "=", value: true });
        const { data, total } = await axelorSearch(CLASSES.partner, PARTNER_FIELDS, criteria);
        return text(formatResult("partenaire", data, total));
    },
);

server.registerTool(
    "get_partner",
    {
        description: "Obtenir tous les détails d'un partenaire Axelor par son ID",
        inputSchema: {
            id: z.number().describe("ID du partenaire (champ 'id' retourné par search_partners)"),
        },
    },
    async ({ id }) => {
        const partner = await axelorGetById(CLASSES.partner, id);
        return text(partner ? JSON.stringify(partner, null, 2) : `Partenaire ID ${id} introuvable.`);
    },
);

// ── Produits ──────────────────────────────────────────────────────────────────

server.registerTool(
    "search_products",
    {
        description: "Rechercher des produits dans Axelor par nom ou code",
        inputSchema: {
            query: z.string().describe("Nom ou code du produit"),
            productType: z
                .enum(["all", "storable", "consumable", "service"])
                .optional()
                .describe("Type de produit : storable, consumable, service (défaut : all)"),
        },
    },
    async ({ query, productType = "all" }) => {
        const criteria: Criterion[] = [
            {
                operator: "or",
                criteria: [
                    { fieldName: "name", operator: "like", value: `%${query}%` },
                    { fieldName: "code", operator: "like", value: `%${query}%` },
                ],
            },
        ];
        if (productType === "storable") criteria.push({ fieldName: "productTypeSelect", operator: "=", value: "storable" });
        if (productType === "consumable") criteria.push({ fieldName: "productTypeSelect", operator: "=", value: "consumable" });
        if (productType === "service") criteria.push({ fieldName: "productTypeSelect", operator: "=", value: "service" });
        const { data, total } = await axelorSearch(CLASSES.product, PRODUCT_FIELDS, criteria);
        return text(formatResult("produit", data, total));
    },
);

// ── Analyse des ventes ───────────────────────────────────────────────────────

type SaleOrderAnalysis = {
    id: number;
    orderDate: string | null;
    statusSelect: number;
    invoicingState: number;
    exTaxTotal: number | string;
    amountInvoiced: number | string;
    totalCostPrice: number | string;
    totalGrossMargin: number | string;
    marginRate: number | string;
    clientPartner: { id: number; name: string } | null;
    salespersonUser: { id: number; name: string } | null;
    currency: { id: number; name: string } | null;
};

type SaleGroup = {
    key: string;
    count: number;
    totalExTax: number;
    totalInvoiced: number;
    totalCost: number;
    totalMargin: number;
    avgMarginRate: number;
    invoicingRate: number;
};

function groupOrders(orders: SaleOrderAnalysis[], groupBy: "month" | "client" | "salesperson" | "status"): SaleGroup[] {
    const statusLabels: Record<number, string> = { 1: "Brouillon", 2: "Devis finalisé", 3: "Confirmée", 4: "Terminée", 5: "Annulée" };
    const map = new Map<string, SaleGroup & { _marginRateSum: number }>();

    for (const o of orders) {
        let key: string;
        if (groupBy === "month") key = o.orderDate ? o.orderDate.slice(0, 7) : "inconnu";
        else if (groupBy === "client") key = o.clientPartner?.name ?? "inconnu";
        else if (groupBy === "salesperson") key = o.salespersonUser?.name ?? "non assigné";
        else key = statusLabels[o.statusSelect] ?? String(o.statusSelect);

        const g = map.get(key) ?? { key, count: 0, totalExTax: 0, totalInvoiced: 0, totalCost: 0, totalMargin: 0, avgMarginRate: 0, invoicingRate: 0, _marginRateSum: 0 };
        g.count++;
        g.totalExTax    += Number(o.exTaxTotal)       || 0;
        g.totalInvoiced += Number(o.amountInvoiced)   || 0;
        g.totalCost     += Number(o.totalCostPrice)   || 0;
        g.totalMargin   += Number(o.totalGrossMargin) || 0;
        g._marginRateSum += Number(o.marginRate)      || 0;
        map.set(key, g);
    }

    const groups: SaleGroup[] = Array.from(map.values()).map(({ _marginRateSum, ...g }) => ({
        ...g,
        avgMarginRate: g.count > 0 ? Math.round(_marginRateSum / g.count * 10) / 10 : 0,
        invoicingRate: g.totalExTax > 0 ? Math.round(g.totalInvoiced / g.totalExTax * 1000) / 10 : 0,
    }));

    return groupBy === "month"
        ? groups.sort((a, b) => a.key.localeCompare(b.key))
        : groups.sort((a, b) => b.totalExTax - a.totalExTax);
}

function fmt(n: number): string {
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}

function formatAnalysisResult(params: {
    groups: SaleGroup[];
    allGroups: SaleGroup[];
    total: number;
    fetched: number;
    groupBy: string;
    dateFrom?: string;
    dateTo?: string;
    statusLabels: string[];
    topN: number;
}): string {
    const { groups, allGroups, total, fetched, groupBy, dateFrom, dateTo, statusLabels, topN } = params;

    const periode = dateFrom || dateTo ? `${dateFrom ?? "…"} → ${dateTo ?? "…"}` : "toutes périodes";
    const lines: string[] = [
        `Analyse des ventes — groupBy: ${groupBy} | Période: ${periode}`,
        `Statuts: ${statusLabels.join(", ")} | ${fetched} commandes analysées sur ${total}`,
        "",
        `Rang | ${"Groupe".padEnd(30)} | Cmdes | ${"CA HT".padStart(14)} | ${"Facturé".padStart(14)} | Taux fact. | ${"Marge brute".padStart(14)} | Tx marge`,
        `-----|${"-".repeat(32)}|-------|${"-".repeat(16)}|${"-".repeat(16)}|------------|${"-".repeat(16)}|----------`,
    ];

    groups.slice(0, topN).forEach((g, i) => {
        lines.push(
            `${String(i + 1).padStart(4)} | ${g.key.padEnd(30)} | ${String(g.count).padStart(5)} | ${fmt(g.totalExTax).padStart(14)} | ${fmt(g.totalInvoiced).padStart(14)} | ${String(g.invoicingRate.toFixed(1) + " %").padStart(10)} | ${fmt(g.totalMargin).padStart(14)} | ${String(g.avgMarginRate.toFixed(1) + " %").padStart(8)}`
        );
    });

    // Ligne TOTAL sur l'ensemble des groupes (pas seulement topN)
    const tot = allGroups.reduce((acc, g) => ({
        count: acc.count + g.count,
        totalExTax: acc.totalExTax + g.totalExTax,
        totalInvoiced: acc.totalInvoiced + g.totalInvoiced,
        totalMargin: acc.totalMargin + g.totalMargin,
    }), { count: 0, totalExTax: 0, totalInvoiced: 0, totalMargin: 0 });
    const totInvoicingRate = tot.totalExTax > 0 ? (tot.totalInvoiced / tot.totalExTax * 100).toFixed(1) + " %" : "—";

    lines.push(`-----|${"-".repeat(32)}|-------|${"-".repeat(16)}|${"-".repeat(16)}|------------|${"-".repeat(16)}|----------`);
    lines.push(`TOTAL| ${"—".padEnd(30)} | ${String(tot.count).padStart(5)} | ${fmt(tot.totalExTax).padStart(14)} | ${fmt(tot.totalInvoiced).padStart(14)} | ${totInvoicingRate.padStart(10)} | ${fmt(tot.totalMargin).padStart(14)} |`);

    if (fetched < total) {
        lines.push("", `⚠ Seules ${fetched} commandes sur ${total} ont été analysées (limite 2000) — affiner la période ou les filtres.`);
    }

    return lines.join("\n");
}

server.registerTool(
    "analyze_sales",
    {
        description:
            "Analyse agrégée des commandes clients : CA par mois/client/commercial, marges, taux de facturation. Utiliser dateFrom/dateTo pour la période et groupBy pour l'axe d'analyse.",
        inputSchema: {
            groupBy: z
                .enum(["month", "client", "salesperson", "status"])
                .describe("Axe d'analyse : month (tendance mensuelle), client (top clients), salesperson (performance commerciaux), status (répartition par statut)"),
            dateFrom: z.string().optional().describe("Date de début (YYYY-MM-DD) — filtre sur orderDate"),
            dateTo: z.string().optional().describe("Date de fin (YYYY-MM-DD) — filtre sur orderDate"),
            statusSelect: z
                .array(z.enum(["draft", "finalized", "confirmed", "completed", "cancelled"]))
                .optional()
                .describe("Statuts à inclure (défaut : draft, finalized, confirmed, completed — hors annulées)"),
            clientName: z.string().optional().describe("Filtrer par client (nom partiel)"),
            salespersonName: z.string().optional().describe("Filtrer par commercial (nom partiel)"),
            topN: z.number().optional().describe("Nombre de groupes à afficher (défaut : 20)"),
        },
    },
    async ({ groupBy, dateFrom, dateTo, statusSelect, clientName, salespersonName, topN = 20 }) => {
        const statusMap = { draft: 1, finalized: 2, confirmed: 3, completed: 4, cancelled: 5 };
        const activeStatuses = statusSelect?.length ? statusSelect : ["draft", "finalized", "confirmed", "completed"] as const;
        const activeValues = activeStatuses.map(s => statusMap[s as keyof typeof statusMap]);

        const criteria: Criterion[] = [
            { operator: "or", criteria: activeValues.map(v => ({ fieldName: "statusSelect", operator: "=", value: v })) },
        ];
        if (dateFrom) criteria.push({ fieldName: "orderDate", operator: ">=", value: dateFrom });
        if (dateTo)   criteria.push({ fieldName: "orderDate", operator: "<=", value: dateTo });
        if (clientName)      criteria.push({ fieldName: "clientPartner.name", operator: "like", value: `%${clientName}%` });
        if (salespersonName) criteria.push({ fieldName: "salespersonUser.name", operator: "like", value: `%${salespersonName}%` });

        const { data, total } = await axelorSearch(CLASSES.saleOrder, SALE_ANALYSIS_FIELDS, criteria, {
            limit: 2000,
            sortBy: ["orderDate"],
        });

        const orders = data as SaleOrderAnalysis[];
        const allGroups = groupOrders(orders, groupBy);

        return text(formatAnalysisResult({
            groups: allGroups,
            allGroups,
            total,
            fetched: orders.length,
            groupBy,
            dateFrom,
            dateTo,
            statusLabels: activeStatuses as unknown as string[],
            topN,
        }));
    },
);

// ── Commandes clients (SaleOrder) ─────────────────────────────────────────────

/*
  statusSelect :
    1 = Brouillon / Devis
    2 = Devis finalisé
    3 = Commande confirmée
    4 = Terminée
    5 = Annulée

  invoicingState :
    0 = Non facturé
    1 = Partiellement facturé
    2 = Facturé

  deliveryState :
    0 = Non livré
    1 = Partiellement livré
    2 = Livré
*/

server.registerTool(
    "search_sale_orders",
    {
        description:
            "Rechercher des commandes clients (SaleOrder) dans Axelor. Filtres possibles : client, numéro de commande, statut, état facturation, état livraison, période de confirmation. Supporte la pagination via offset/limit.",
        inputSchema: {
            clientName: z
                .string()
                .optional()
                .describe("Nom (partiel) du client"),
            orderSeq: z
                .string()
                .optional()
                .describe("Numéro interne de la commande (ex: SO-00042)"),
            externalReference: z
                .string()
                .optional()
                .describe("Référence client (bon de commande client)"),
            statusSelect: z
                .enum(["draft", "finalized", "confirmed", "completed", "cancelled"])
                .optional()
                .describe("Statut : draft=1, finalized=2, confirmed=3, completed=4, cancelled=5"),
            invoicingState: z
                .enum(["not_invoiced", "partially_invoiced", "invoiced"])
                .optional()
                .describe("État de facturation"),
            deliveryState: z
                .enum(["not_delivered", "partially_delivered", "delivered"])
                .optional()
                .describe("État de livraison"),
            dateFrom: z
                .string()
                .optional()
                .describe("Date de confirmation minimale (YYYY-MM-DD) — filtre sur confirmationDateTime"),
            dateTo: z
                .string()
                .optional()
                .describe("Date de confirmation maximale (YYYY-MM-DD) — filtre sur confirmationDateTime"),
            limit: z
                .number()
                .optional()
                .describe("Nombre de résultats à retourner (défaut : 20, max recommandé : 200)"),
            offset: z
                .number()
                .optional()
                .describe("Décalage pour la pagination (défaut : 0)"),
        },
    },
    async ({ clientName, orderSeq, externalReference, statusSelect, invoicingState, deliveryState, dateFrom, dateTo, limit, offset }) => {
        const criteria: Criterion[] = [];

        if (clientName) criteria.push({ fieldName: "clientPartner.name", operator: "like", value: `%${clientName}%` });
        if (orderSeq) criteria.push({ fieldName: "saleOrderSeq", operator: "like", value: `%${orderSeq}%` });
        if (externalReference) criteria.push({ fieldName: "externalReference", operator: "like", value: `%${externalReference}%` });

        const statusMap = { draft: 1, finalized: 2, confirmed: 3, completed: 4, cancelled: 5 };
        if (statusSelect) criteria.push({ fieldName: "statusSelect", operator: "=", value: statusMap[statusSelect] });

        const invoicingMap = { not_invoiced: 0, partially_invoiced: 1, invoiced: 2 };
        if (invoicingState) criteria.push({ fieldName: "invoicingState", operator: "=", value: invoicingMap[invoicingState] });

        const deliveryMap = { not_delivered: 0, partially_delivered: 1, delivered: 2 };
        if (deliveryState) criteria.push({ fieldName: "deliveryState", operator: "=", value: deliveryMap[deliveryState] });

        if (dateFrom) criteria.push({ fieldName: "confirmationDateTime", operator: ">=", value: `${dateFrom}T00:00:00` });
        if (dateTo)   criteria.push({ fieldName: "confirmationDateTime", operator: "<=", value: `${dateTo}T23:59:59` });

        if (criteria.length === 0) criteria.push({ fieldName: "id", operator: "notNull", value: null });

        const { data, total } = await axelorSearch(CLASSES.saleOrder, SALE_ORDER_FIELDS, criteria, {
            sortBy: ["-orderDate"],
            limit: limit ?? 20,
            offset: offset ?? 0,
        });
        return text(formatResult("commande client", data, total));
    },
);

server.registerTool(
    "get_sale_order",
    {
        description: "Obtenir tous les détails d'une commande client Axelor par son ID",
        inputSchema: {
            id: z.number().describe("ID de la commande (champ 'id' retourné par search_sale_orders)"),
        },
    },
    async ({ id }) => {
        const order = await axelorGetById(CLASSES.saleOrder, id);
        return text(order ? JSON.stringify(order, null, 2) : `Commande ID ${id} introuvable.`);
    },
);

server.registerTool(
    "create_sale_order",
    {
        description:
            "Créer un devis (commande client) dans Axelor. Retourne le devis créé avec son numéro.",
        inputSchema: {
            clientPartnerId: z
                .number()
                .describe("ID du client (champ 'id' retourné par search_partners)"),
            externalReference: z
                .string()
                .optional()
                .describe("Référence client / objet du devis (ex: bon de commande, intitulé projet)"),
            contactId: z
                .number()
                .optional()
                .describe("ID du contact chez le client"),
            deliveredPartnerId: z
                .number()
                .optional()
                .describe("ID du partenaire livré si différent du client"),
            companyId: z
                .number()
                .optional()
                .describe("ID de la société émettrice (défaut : société principale)"),
            currencyId: z
                .number()
                .optional()
                .describe("ID de la devise (défaut : EUR)"),
            inAti: z
                .boolean()
                .optional()
                .describe("Prix TTC si true, HT si false (défaut : false)"),
            saleOrderLineList: z
                .array(
                    z.object({
                        productId: z.number().describe("ID du produit"),
                        quantity: z.number().describe("Quantité"),
                    }),
                )
                .optional()
                .describe("Lignes de devis à ajouter"),
        },
    },
    async ({ clientPartnerId, externalReference, contactId, deliveredPartnerId, companyId, currencyId, inAti, saleOrderLineList }) => {
        const body: Record<string, unknown> = { clientPartnerId };
        if (externalReference !== undefined) body.externalReference = externalReference;
        if (contactId !== undefined) body.contactId = contactId;
        if (deliveredPartnerId !== undefined) body.deliveredPartnerId = deliveredPartnerId;
        if (companyId !== undefined) body.companyId = companyId;
        if (currencyId !== undefined) body.currencyId = currencyId;
        if (inAti !== undefined) body.inAti = inAti;
        if (saleOrderLineList !== undefined) body.saleOrderLineList = saleOrderLineList;

        const res = await axelorFetch("/aos/sale-order", {
            method: "POST",
            body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error(`Échec création devis: ${res.status} — ${await res.text()}`);
        const json = await res.json();
        return text(JSON.stringify(json, null, 2));
    },
);

// ── Pistes / Leads (CRM) ─────────────────────────────────────────────────────

server.registerTool(
    "search_leads",
    {
        description:
            "Rechercher des pistes (leads) CRM dans Axelor. Filtres : nom, entreprise, responsable, statut, scoring, source. Idéal pour lister les pistes à traiter ou relancer.",
        inputSchema: {
            name: z.string().optional().describe("Nom ou prénom (partiel) du contact"),
            enterpriseName: z.string().optional().describe("Nom (partiel) de l'entreprise"),
            userName: z.string().optional().describe("Nom (partiel) du responsable assigné"),
            leadScoringSelect: z
                .enum(["cold", "warm", "hot"])
                .optional()
                .describe("Scoring : cold=1, warm=2, hot=3"),
            isConverted: z.boolean().optional().describe("Filtrer les pistes converties (true) ou non converties (false)"),
            isNurturing: z.boolean().optional().describe("Filtrer les pistes en nurturing"),
            archived: z.boolean().optional().describe("Inclure les pistes archivées (défaut : false)"),
        },
    },
    async ({ name, enterpriseName, userName, leadScoringSelect, isConverted, isNurturing, archived }) => {
        const criteria: Criterion[] = [];

        if (name)
            criteria.push({
                operator: "or",
                criteria: [
                    { fieldName: "name", operator: "like", value: `%${name}%` },
                    { fieldName: "firstName", operator: "like", value: `%${name}%` },
                ],
            });
        if (enterpriseName) criteria.push({ fieldName: "enterpriseName", operator: "like", value: `%${enterpriseName}%` });
        if (userName) criteria.push({ fieldName: "user.name", operator: "like", value: `%${userName}%` });

        const scoringMap = { cold: 1, warm: 2, hot: 3 };
        if (leadScoringSelect) criteria.push({ fieldName: "leadScoringSelect", operator: "=", value: scoringMap[leadScoringSelect] });
        if (isConverted !== undefined) criteria.push({ fieldName: "isConverted", operator: "=", value: isConverted });
        if (isNurturing !== undefined) criteria.push({ fieldName: "isNurturing", operator: "=", value: isNurturing });
        if (!archived) criteria.push({ fieldName: "archived", operator: "=", value: false });

        if (criteria.length === 0) criteria.push({ fieldName: "id", operator: "notNull", value: null });

        const { data, total } = await axelorSearch(CLASSES.lead, LEAD_FIELDS, criteria, {
            sortBy: ["-leadScoringSelect", "-createdOn"],
        });
        return text(formatResult("piste", data, total));
    },
);

server.registerTool(
    "get_lead",
    {
        description: "Obtenir tous les détails d'une piste (lead) CRM Axelor par son ID",
        inputSchema: {
            id: z.number().describe("ID de la piste (champ 'id' retourné par search_leads)"),
        },
    },
    async ({ id }) => {
        const lead = await axelorGetById(CLASSES.lead, id);
        return text(lead ? JSON.stringify(lead, null, 2) : `Piste ID ${id} introuvable.`);
    },
);

server.registerTool(
    "create_lead",
    {
        description: "Créer une piste (lead) CRM dans Axelor. Retourne la piste créée avec son ID.",
        inputSchema: {
            firstName: z.string().optional().describe("Prénom du contact"),
            name: z.string().describe("Nom du contact"),
            enterpriseName: z.string().optional().describe("Nom de l'entreprise"),
            emailAddress: z.string().optional().describe("Adresse email (ex: contact@example.com)"),
            fixedPhone: z.string().optional().describe("Téléphone fixe"),
            mobilePhone: z.string().optional().describe("Téléphone mobile"),
            userId: z.number().optional().describe("ID de l'utilisateur responsable"),
            sourceId: z.number().optional().describe("ID de la source (Source)"),
            leadScoringSelect: z
                .enum(["cold", "warm", "hot"])
                .optional()
                .describe("Scoring de la piste : cold=1, warm=2, hot=3"),
            description: z.string().optional().describe("Description / notes"),
            webSite: z.string().optional().describe("Site web de l'entreprise"),
            primaryAddress: z.string().optional().describe("Adresse (texte libre)"),
        },
    },
    async ({ firstName, name, enterpriseName, emailAddress, fixedPhone, mobilePhone, userId, sourceId, leadScoringSelect, description, webSite, primaryAddress }) => {
        const scoringMap = { cold: 1, warm: 2, hot: 3 };
        const data: Record<string, unknown> = { name };

        if (firstName !== undefined) data.firstName = firstName;
        if (enterpriseName !== undefined) data.enterpriseName = enterpriseName;
        if (emailAddress !== undefined) data.emailAddress = { address: emailAddress };
        if (fixedPhone !== undefined) data.fixedPhone = fixedPhone;
        if (mobilePhone !== undefined) data.mobilePhone = mobilePhone;
        if (userId !== undefined) data.user = { id: userId };
        if (sourceId !== undefined) data.source = { id: sourceId };
        if (leadScoringSelect !== undefined) data.leadScoringSelect = scoringMap[leadScoringSelect];
        if (description !== undefined) data.description = description;
        if (webSite !== undefined) data.webSite = webSite;
        if (primaryAddress !== undefined) data.primaryAddress = primaryAddress;

        const result = await axelorCreate(CLASSES.lead, data);
        return text(result ? JSON.stringify(result, null, 2) : "Échec de la création de la piste.");
    },
);

// ── Opportunités (CRM) ────────────────────────────────────────────────────────

async function axelorCreate(className: string, data: Record<string, unknown>): Promise<unknown> {
    const res = await axelorFetch(`/ws/rest/${className}`, {
        method: "PUT",
        body: JSON.stringify({ data }),
    });
    if (!res.ok) throw new Error(`Axelor create failed (${className}): ${res.status} — ${await res.text()}`);
    const json = (await res.json()) as { data?: unknown[] };
    return json.data?.[0] ?? null;
}

server.registerTool(
    "search_opportunities",
    {
        description: "Rechercher des opportunités CRM dans Axelor. Filtres : nom, client, responsable, statut de l'étape de vente.",
        inputSchema: {
            name: z.string().optional().describe("Nom (partiel) de l'opportunité"),
            partnerName: z.string().optional().describe("Nom (partiel) du client / prospect"),
            userName: z.string().optional().describe("Nom (partiel) du responsable assigné"),
            archived: z.boolean().optional().describe("Inclure les opportunités archivées (défaut : false)"),
        },
    },
    async ({ name, partnerName, userName, archived }) => {
        const criteria: Criterion[] = [];
        if (name) criteria.push({ fieldName: "name", operator: "like", value: `%${name}%` });
        if (partnerName) criteria.push({ fieldName: "partner.name", operator: "like", value: `%${partnerName}%` });
        if (userName) criteria.push({ fieldName: "user.name", operator: "like", value: `%${userName}%` });
        if (!archived) criteria.push({ fieldName: "archived", operator: "=", value: false });
        if (criteria.length === 0) criteria.push({ fieldName: "id", operator: "notNull", value: null });

        const { data, total } = await axelorSearch(CLASSES.opportunity, OPPORTUNITY_FIELDS, criteria, {
            sortBy: ["-expectedCloseDate"],
        });
        return text(formatResult("opportunité", data, total));
    },
);

server.registerTool(
    "get_opportunity",
    {
        description: "Obtenir tous les détails d'une opportunité CRM Axelor par son ID",
        inputSchema: {
            id: z.number().describe("ID de l'opportunité (champ 'id' retourné par search_opportunities)"),
        },
    },
    async ({ id }) => {
        const opp = await axelorGetById(CLASSES.opportunity, id);
        return text(opp ? JSON.stringify(opp, null, 2) : `Opportunité ID ${id} introuvable.`);
    },
);

server.registerTool(
    "create_opportunity",
    {
        description: "Créer une opportunité CRM dans Axelor. Retourne l'opportunité créée avec sa référence.",
        inputSchema: {
            name: z.string().describe("Nom / intitulé de l'opportunité"),
            partnerId: z.number().describe("ID du client ou prospect (champ 'id' retourné par search_partners)"),
            contactId: z.number().optional().describe("ID du contact chez le client"),
            userId: z.number().optional().describe("ID de l'utilisateur responsable"),
            amount: z.number().optional().describe("Montant estimé (HT)"),
            probability: z.number().optional().describe("Probabilité de closing en % (0-100)"),
            expectedCloseDate: z.string().optional().describe("Date de clôture prévue (format YYYY-MM-DD)"),
            opportunityStatusId: z.number().optional().describe("ID de l'étape de vente (OpportunityStatus)"),
            opportunityTypeId: z.number().optional().describe("ID du type de besoin (OpportunityType)"),
            sourceId: z.number().optional().describe("ID de la source (Source)"),
            currencyId: z.number().optional().describe("ID de la devise"),
            description: z.string().optional().describe("Description interne"),
            customerDescription: z.string().optional().describe("Description client"),
        },
    },
    async ({ name, partnerId, contactId, userId, amount, probability, expectedCloseDate, opportunityStatusId, opportunityTypeId, sourceId, currencyId, description, customerDescription }) => {
        const data: Record<string, unknown> = {
            name,
            partner: { id: partnerId },
        };
        if (contactId !== undefined) data.contact = { id: contactId };
        if (userId !== undefined) data.user = { id: userId };
        if (amount !== undefined) data.amount = amount;
        if (probability !== undefined) data.probability = probability;
        if (expectedCloseDate !== undefined) data.expectedCloseDate = expectedCloseDate;
        if (opportunityStatusId !== undefined) data.opportunityStatus = { id: opportunityStatusId };
        if (opportunityTypeId !== undefined) data.opportunityType = { id: opportunityTypeId };
        if (sourceId !== undefined) data.source = { id: sourceId };
        if (currencyId !== undefined) data.currency = { id: currencyId };
        if (description !== undefined) data.description = description;
        if (customerDescription !== undefined) data.customerDescription = customerDescription;

        const result = await axelorCreate(CLASSES.opportunity, data);
        return text(result ? JSON.stringify(result, null, 2) : "Échec de la création de l'opportunité.");
    },
);

// ── Analyse produits (SaleOrderLine) ─────────────────────────────────────────

type SaleOrderLine = {
    id: number;
    typeSelect: number;
    productName?: string;
    product?: { id: number; code?: string; name?: string; "productFamily.name"?: string; "productCategory.name"?: string };
    qty?: number;
    "unit.name"?: string;
    price?: number;
    exTaxTotal?: number;
    "saleOrder.id"?: number;
    "saleOrder.saleOrderSeq"?: string;
    "saleOrder.orderDate"?: string;
    "saleOrder.statusSelect"?: number;
    "saleOrder.clientPartner.name"?: string;
};

server.registerTool(
    "analyze_products",
    {
        description:
            "Analyse les lignes de commande (SaleOrderLine) pour identifier les produits les plus vendus sur une période : CA HT, quantité, répartition mensuelle, famille et catégorie produit.",
        inputSchema: {
            dateFrom: z.string().describe("Date de début (YYYY-MM-DD) — filtre sur saleOrder.orderDate"),
            dateTo: z.string().describe("Date de fin (YYYY-MM-DD) — filtre sur saleOrder.orderDate"),
            groupBy: z
                .enum(["product", "family", "category"])
                .optional()
                .describe("Axe d'agrégation : product (par produit, défaut), family (par famille), category (par catégorie)"),
            clientName: z.string().optional().describe("Filtrer par client (nom partiel)"),
            topN: z.number().optional().describe("Nombre de lignes à afficher (défaut : 20)"),
        },
    },
    async ({ dateFrom, dateTo, groupBy = "product", clientName, topN = 20 }) => {
        const criteria: Criterion[] = [
            { fieldName: "saleOrder.orderDate", operator: ">=", value: dateFrom },
            { fieldName: "saleOrder.orderDate", operator: "<=", value: dateTo },
            // Exclure les lignes titre/commentaire (typeSelect = 0 = normal)
            { fieldName: "typeSelect", operator: "=", value: 0 },
            // Exclure les commandes annulées
            { fieldName: "saleOrder.statusSelect", operator: "!=", value: 5 },
        ];
        if (clientName) criteria.push({ fieldName: "saleOrder.clientPartner.name", operator: "like", value: `%${clientName}%` });

        const { data, total } = await axelorSearch(CLASSES.saleOrderLine, SALE_ORDER_LINE_FIELDS, criteria, {
            limit: 5000,
            sortBy: ["saleOrder.orderDate"],
        });

        const lines = data as SaleOrderLine[];

        type GroupStats = {
            label: string;
            exTaxTotal: number;
            qty: number;
            orderCount: Set<number>;
            byMonth: Record<string, number>;
        };

        const groups = new Map<string, GroupStats>();

        for (const line of lines) {
            const exTaxTotal = Number(line.exTaxTotal ?? 0);
            const qty = Number(line.qty ?? 0);
            const month = line["saleOrder.orderDate"]?.substring(0, 7) ?? "inconnu";
            const orderId = line["saleOrder.id"] ?? 0;

            let key: string;
            let label: string;

            if (groupBy === "family") {
                key = line.product?.["productFamily.name"] ?? "Sans famille";
                label = key;
            } else if (groupBy === "category") {
                key = line.product?.["productCategory.name"] ?? "Sans catégorie";
                label = key;
            } else {
                key = String(line.product?.id ?? `noref_${line.productName}`);
                const code = line.product?.code ? `[${line.product.code}] ` : "";
                label = `${code}${line.productName ?? line.product?.name ?? "Produit inconnu"}`;
            }

            if (!groups.has(key)) {
                groups.set(key, { label, exTaxTotal: 0, qty: 0, orderCount: new Set(), byMonth: {} });
            }
            const g = groups.get(key)!;
            g.exTaxTotal += exTaxTotal;
            g.qty += qty;
            g.orderCount.add(orderId);
            g.byMonth[month] = (g.byMonth[month] ?? 0) + exTaxTotal;
        }

        const sorted = [...groups.values()]
            .sort((a, b) => b.exTaxTotal - a.exTaxTotal)
            .slice(0, topN);

        const totalCA = sorted.reduce((s, g) => s + g.exTaxTotal, 0);
        const months = [...new Set(lines.map(l => l["saleOrder.orderDate"]?.substring(0, 7) ?? "").filter(Boolean))].sort();

        const rows = sorted.map(g => {
            const pct = totalCA > 0 ? ((g.exTaxTotal / totalCA) * 100).toFixed(1) : "0.0";
            const monthCols = months.map(m => `${(g.byMonth[m] ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`).join(" | ");
            return `• ${g.label}\n  CA: ${g.exTaxTotal.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} € (${pct}%) — Qté: ${g.qty.toFixed(0)} — ${g.orderCount.size} commande(s)\n  ${months.join(" | ")}\n  ${monthCols}`;
        });

        const header = [
            `Analyse produits — ${dateFrom} → ${dateTo}`,
            `Groupé par : ${groupBy} | ${lines.length} lignes sur ${total} | Top ${topN}`,
            `CA total analysé : ${totalCA.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`,
            "",
        ].join("\n");

        return text(header + rows.join("\n\n"));
    },
);

// ── Factures (Invoice) ────────────────────────────────────────────────────────

/*
  statusSelect :
    1 = Brouillon
    2 = Validée
    3 = Ventilée
    4 = Annulée

  operationTypeSelect :
    1 = Facture client
    2 = Avoir client
    3 = Facture fournisseur
    4 = Avoir fournisseur
*/

server.registerTool(
    "search_invoices",
    {
        description:
            "Rechercher des factures (Invoice) dans Axelor. Filtres : client, numéro de facture, statut, type de document, période, montant restant dû.",
        inputSchema: {
            partnerName: z.string().optional().describe("Nom (partiel) du client / fournisseur"),
            invoiceId: z.string().optional().describe("Numéro de facture (ex: FAC-00042)"),
            statusSelect: z
                .enum(["draft", "validated", "ventilated", "cancelled"])
                .optional()
                .describe("Statut : draft=1, validated=2, ventilated=3, cancelled=4"),
            operationTypeSelect: z
                .enum(["customer_invoice", "customer_refund", "supplier_invoice", "supplier_refund"])
                .optional()
                .describe("Type : customer_invoice=3, customer_refund=4, supplier_invoice=1, supplier_refund=2 (défaut : customer_invoice)"),
            dateFrom: z.string().optional().describe("Date de facture minimale (YYYY-MM-DD)"),
            dateTo: z.string().optional().describe("Date de facture maximale (YYYY-MM-DD)"),
            dueDateTo: z.string().optional().describe("Échéance maximale (YYYY-MM-DD) — utile pour les impayés"),
            unpaidOnly: z.boolean().optional().describe("Si true, retourne uniquement les factures avec un montant restant dû > 0"),
            limit: z.number().optional().describe("Nombre de résultats (défaut : 20)"),
            offset: z.number().optional().describe("Décalage pour la pagination (défaut : 0)"),
        },
    },
    async ({ partnerName, invoiceId, statusSelect, operationTypeSelect = "customer_invoice", dateFrom, dateTo, dueDateTo, unpaidOnly, limit, offset }) => {
        const statusMap = { draft: 1, validated: 2, ventilated: 3, cancelled: 4 };
        const operationMap = { customer_invoice: 3, customer_refund: 4, supplier_invoice: 1, supplier_refund: 2 };

        const criteria: Criterion[] = [
            { fieldName: "operationTypeSelect", operator: "=", value: operationMap[operationTypeSelect] },
        ];

        if (partnerName) criteria.push({ fieldName: "partner.name", operator: "like", value: `%${partnerName}%` });
        if (invoiceId)   criteria.push({ fieldName: "invoiceId", operator: "like", value: `%${invoiceId}%` });
        if (statusSelect) criteria.push({ fieldName: "statusSelect", operator: "=", value: statusMap[statusSelect] });
        if (dateFrom)    criteria.push({ fieldName: "invoiceDate", operator: ">=", value: dateFrom });
        if (dateTo)      criteria.push({ fieldName: "invoiceDate", operator: "<=", value: dateTo });
        if (dueDateTo)   criteria.push({ fieldName: "dueDate", operator: "<=", value: dueDateTo });
        if (unpaidOnly)  criteria.push({ fieldName: "amountRemaining", operator: ">", value: 0 });

        const { data, total } = await axelorSearch(CLASSES.invoice, INVOICE_FIELDS, criteria, {
            sortBy: ["-invoiceDate"],
            limit: limit ?? 20,
            offset: offset ?? 0,
        });
        return text(formatResult("facture", data, total));
    },
);

server.registerTool(
    "get_invoice",
    {
        description: "Obtenir tous les détails d'une facture Axelor par son ID",
        inputSchema: {
            id: z.number().describe("ID de la facture (champ 'id' retourné par search_invoices)"),
        },
    },
    async ({ id }) => {
        const invoice = await axelorGetById(CLASSES.invoice, id);
        return text(invoice ? JSON.stringify(invoice, null, 2) : `Facture ID ${id} introuvable.`);
    },
);

// ── Démarrage ─────────────────────────────────────────────────────────────────

async function main() {
    sessionCookie = await getSessionCookie();
    console.error("Connecté à Axelor.");
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);
