import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
    CLASSES,
    INVOICE_FIELDS,
    JOB_POSITION_FIELDS,
    LEAD_FIELDS,
    MOVE_LINE_FIELDS,
    PROJECT_TASK_FIELDS,
    OPPORTUNITY_ANALYSIS_FIELDS,
    OPPORTUNITY_FIELDS,
    PARTNER_FIELDS,
    PRODUCT_FIELDS,
    PROJECT_ANALYSIS_FIELDS,
    PROJECT_FIELDS,
    SALE_ANALYSIS_FIELDS,
    SALE_ORDER_FIELDS,
    SALE_ORDER_LINE_FIELDS,
    TIMESHEET_FIELDS,
    TIMESHEET_LINE_FIELDS,
    TRACEBACK_FIELDS,
    TRACEBACK_DETAIL_FIELDS,
} from "./fields.ts";

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

type Criterion =
    | { fieldName: string; operator: string; value: unknown }
    | { operator: "and" | "or"; criteria: Criterion[] };

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

function confirmPreview(label: string, data: Record<string, unknown>): string {
    return (
        `⚠️ Aperçu avant création — rien n'a été créé dans Axelor.\n\n` +
        `${label} qui serait créé(e) :\n\n${JSON.stringify(data, null, 2)}\n\n` +
        `Vérifie ces informations avec l'utilisateur. Si elles sont correctes, rappelle ce même outil ` +
        `avec le paramètre confirm=true pour créer réellement l'enregistrement.`
    );
}

// ── Serveur MCP ───────────────────────────────────────────────────────────────

const server = new McpServer({ name: "axelor-mcp", version: "1.1.0" });

// ── Partenaires ───────────────────────────────────────────────────────────────

server.registerTool(
    "search_partners",
    {
        description:
            "Rechercher des partenaires (clients, fournisseurs, prospects, contacts) dans Axelor par nom ou référence",
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
        if (productType === "storable")
            criteria.push({ fieldName: "productTypeSelect", operator: "=", value: "storable" });
        if (productType === "consumable")
            criteria.push({ fieldName: "productTypeSelect", operator: "=", value: "consumable" });
        if (productType === "service")
            criteria.push({ fieldName: "productTypeSelect", operator: "=", value: "service" });
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
    const statusLabels: Record<number, string> = {
        1: "Brouillon",
        2: "Devis finalisé",
        3: "Confirmée",
        4: "Terminée",
        5: "Annulée",
    };
    const map = new Map<string, SaleGroup & { _marginRateSum: number }>();

    for (const o of orders) {
        let key: string;
        if (groupBy === "month") key = o.orderDate ? o.orderDate.slice(0, 7) : "inconnu";
        else if (groupBy === "client") key = o.clientPartner?.name ?? "inconnu";
        else if (groupBy === "salesperson") key = o.salespersonUser?.name ?? "non assigné";
        else key = statusLabels[o.statusSelect] ?? String(o.statusSelect);

        const g = map.get(key) ?? {
            key,
            count: 0,
            totalExTax: 0,
            totalInvoiced: 0,
            totalCost: 0,
            totalMargin: 0,
            avgMarginRate: 0,
            invoicingRate: 0,
            _marginRateSum: 0,
        };
        g.count++;
        g.totalExTax += Number(o.exTaxTotal) || 0;
        g.totalInvoiced += Number(o.amountInvoiced) || 0;
        g.totalCost += Number(o.totalCostPrice) || 0;
        g.totalMargin += Number(o.totalGrossMargin) || 0;
        g._marginRateSum += Number(o.marginRate) || 0;
        map.set(key, g);
    }

    const groups: SaleGroup[] = Array.from(map.values()).map(({ _marginRateSum, ...g }) => ({
        ...g,
        avgMarginRate: g.count > 0 ? Math.round((_marginRateSum / g.count) * 10) / 10 : 0,
        invoicingRate: g.totalExTax > 0 ? Math.round((g.totalInvoiced / g.totalExTax) * 1000) / 10 : 0,
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
            `${String(i + 1).padStart(4)} | ${g.key.padEnd(30)} | ${String(g.count).padStart(5)} | ${fmt(g.totalExTax).padStart(14)} | ${fmt(g.totalInvoiced).padStart(14)} | ${String(g.invoicingRate.toFixed(1) + " %").padStart(10)} | ${fmt(g.totalMargin).padStart(14)} | ${String(g.avgMarginRate.toFixed(1) + " %").padStart(8)}`,
        );
    });

    // Ligne TOTAL sur l'ensemble des groupes (pas seulement topN)
    const tot = allGroups.reduce(
        (acc, g) => ({
            count: acc.count + g.count,
            totalExTax: acc.totalExTax + g.totalExTax,
            totalInvoiced: acc.totalInvoiced + g.totalInvoiced,
            totalMargin: acc.totalMargin + g.totalMargin,
        }),
        { count: 0, totalExTax: 0, totalInvoiced: 0, totalMargin: 0 },
    );
    const totInvoicingRate = tot.totalExTax > 0 ? ((tot.totalInvoiced / tot.totalExTax) * 100).toFixed(1) + " %" : "—";

    lines.push(
        `-----|${"-".repeat(32)}|-------|${"-".repeat(16)}|${"-".repeat(16)}|------------|${"-".repeat(16)}|----------`,
    );
    lines.push(
        `TOTAL| ${"—".padEnd(30)} | ${String(tot.count).padStart(5)} | ${fmt(tot.totalExTax).padStart(14)} | ${fmt(tot.totalInvoiced).padStart(14)} | ${totInvoicingRate.padStart(10)} | ${fmt(tot.totalMargin).padStart(14)} |`,
    );

    if (fetched < total) {
        lines.push(
            "",
            `⚠ Seules ${fetched} commandes sur ${total} ont été analysées (limite 2000) — affiner la période ou les filtres.`,
        );
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
                .describe(
                    "Axe d'analyse : month (tendance mensuelle), client (top clients), salesperson (performance commerciaux), status (répartition par statut)",
                ),
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
        const activeStatuses = statusSelect?.length
            ? statusSelect
            : (["draft", "finalized", "confirmed", "completed"] as const);
        const activeValues = activeStatuses.map((s) => statusMap[s as keyof typeof statusMap]);

        const criteria: Criterion[] = [
            {
                operator: "or",
                criteria: activeValues.map((v) => ({ fieldName: "statusSelect", operator: "=", value: v })),
            },
        ];
        if (dateFrom) criteria.push({ fieldName: "orderDate", operator: ">=", value: dateFrom });
        if (dateTo) criteria.push({ fieldName: "orderDate", operator: "<=", value: dateTo });
        if (clientName) criteria.push({ fieldName: "clientPartner.name", operator: "like", value: `%${clientName}%` });
        if (salespersonName)
            criteria.push({ fieldName: "salespersonUser.name", operator: "like", value: `%${salespersonName}%` });

        const { data, total } = await axelorSearch(CLASSES.saleOrder, SALE_ANALYSIS_FIELDS, criteria, {
            limit: 2000,
            sortBy: ["orderDate"],
        });

        const orders = data as SaleOrderAnalysis[];
        const allGroups = groupOrders(orders, groupBy);

        return text(
            formatAnalysisResult({
                groups: allGroups,
                allGroups,
                total,
                fetched: orders.length,
                groupBy,
                dateFrom,
                dateTo,
                statusLabels: activeStatuses as unknown as string[],
                topN,
            }),
        );
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
            clientName: z.string().optional().describe("Nom (partiel) du client"),
            orderSeq: z.string().optional().describe("Numéro interne de la commande (ex: SO-00042)"),
            externalReference: z.string().optional().describe("Référence client (bon de commande client)"),
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
            offset: z.number().optional().describe("Décalage pour la pagination (défaut : 0)"),
        },
    },
    async ({
        clientName,
        orderSeq,
        externalReference,
        statusSelect,
        invoicingState,
        deliveryState,
        dateFrom,
        dateTo,
        limit,
        offset,
    }) => {
        const criteria: Criterion[] = [];

        if (clientName) criteria.push({ fieldName: "clientPartner.name", operator: "like", value: `%${clientName}%` });
        if (orderSeq) criteria.push({ fieldName: "saleOrderSeq", operator: "like", value: `%${orderSeq}%` });
        if (externalReference)
            criteria.push({ fieldName: "externalReference", operator: "like", value: `%${externalReference}%` });

        const statusMap = { draft: 1, finalized: 2, confirmed: 3, completed: 4, cancelled: 5 };
        if (statusSelect) criteria.push({ fieldName: "statusSelect", operator: "=", value: statusMap[statusSelect] });

        const invoicingMap = { not_invoiced: 0, partially_invoiced: 1, invoiced: 2 };
        if (invoicingState)
            criteria.push({ fieldName: "invoicingState", operator: "=", value: invoicingMap[invoicingState] });

        const deliveryMap = { not_delivered: 0, partially_delivered: 1, delivered: 2 };
        if (deliveryState)
            criteria.push({ fieldName: "deliveryState", operator: "=", value: deliveryMap[deliveryState] });

        if (dateFrom)
            criteria.push({ fieldName: "confirmationDateTime", operator: ">=", value: `${dateFrom}T00:00:00` });
        if (dateTo) criteria.push({ fieldName: "confirmationDateTime", operator: "<=", value: `${dateTo}T23:59:59` });

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
        description: "Créer un devis (commande client) dans Axelor. Retourne le devis créé avec son numéro.",
        inputSchema: {
            clientPartnerId: z.number().describe("ID du client (champ 'id' retourné par search_partners)"),
            externalReference: z
                .string()
                .optional()
                .describe("Référence client / objet du devis (ex: bon de commande, intitulé projet)"),
            contactId: z.number().optional().describe("ID du contact chez le client"),
            deliveredPartnerId: z.number().optional().describe("ID du partenaire livré si différent du client"),
            companyId: z.number().optional().describe("ID de la société émettrice (défaut : société principale)"),
            currencyId: z.number().optional().describe("ID de la devise (défaut : EUR)"),
            inAti: z.boolean().optional().describe("Prix TTC si true, HT si false (défaut : false)"),
            saleOrderLineList: z
                .array(
                    z.object({
                        productId: z.number().describe("ID du produit"),
                        quantity: z.number().describe("Quantité"),
                    }),
                )
                .optional()
                .describe("Lignes de devis à ajouter"),
            confirm: z
                .boolean()
                .optional()
                .describe(
                    "Mettre à true uniquement après validation explicite de l'utilisateur. Sans ce paramètre (ou false), l'outil renvoie un aperçu du devis sans rien créer.",
                ),
        },
    },
    async ({
        clientPartnerId,
        externalReference,
        contactId,
        deliveredPartnerId,
        companyId,
        currencyId,
        inAti,
        saleOrderLineList,
        confirm,
    }) => {
        const body: Record<string, unknown> = { clientPartnerId };
        if (externalReference !== undefined) body.externalReference = externalReference;
        if (contactId !== undefined) body.contactId = contactId;
        if (deliveredPartnerId !== undefined) body.deliveredPartnerId = deliveredPartnerId;
        if (companyId !== undefined) body.companyId = companyId;
        if (currencyId !== undefined) body.currencyId = currencyId;
        if (inAti !== undefined) body.inAti = inAti;
        if (saleOrderLineList !== undefined) body.saleOrderLineList = saleOrderLineList;

        if (!confirm) return text(confirmPreview("Le devis", body));

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
            leadScoringSelect: z.enum(["cold", "warm", "hot"]).optional().describe("Scoring : cold=1, warm=2, hot=3"),
            isConverted: z
                .boolean()
                .optional()
                .describe("Filtrer les pistes converties (true) ou non converties (false)"),
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
        if (enterpriseName)
            criteria.push({ fieldName: "enterpriseName", operator: "like", value: `%${enterpriseName}%` });
        if (userName) criteria.push({ fieldName: "user.name", operator: "like", value: `%${userName}%` });

        const scoringMap = { cold: 1, warm: 2, hot: 3 };
        if (leadScoringSelect)
            criteria.push({ fieldName: "leadScoringSelect", operator: "=", value: scoringMap[leadScoringSelect] });
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
            confirm: z
                .boolean()
                .optional()
                .describe(
                    "Mettre à true uniquement après validation explicite de l'utilisateur. Sans ce paramètre (ou false), l'outil renvoie un aperçu de la piste sans rien créer.",
                ),
        },
    },
    async ({
        firstName,
        name,
        enterpriseName,
        emailAddress,
        fixedPhone,
        mobilePhone,
        userId,
        sourceId,
        leadScoringSelect,
        description,
        webSite,
        primaryAddress,
        confirm,
    }) => {
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

        if (!confirm) return text(confirmPreview("La piste (lead)", data));

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
        description:
            "Rechercher des opportunités CRM dans Axelor. Filtres : nom, client, responsable, statut de l'étape de vente.",
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
            confirm: z
                .boolean()
                .optional()
                .describe(
                    "Mettre à true uniquement après validation explicite de l'utilisateur. Sans ce paramètre (ou false), l'outil renvoie un aperçu de l'opportunité sans rien créer.",
                ),
        },
    },
    async ({
        name,
        partnerId,
        contactId,
        userId,
        amount,
        probability,
        expectedCloseDate,
        opportunityStatusId,
        opportunityTypeId,
        sourceId,
        currencyId,
        description,
        customerDescription,
        confirm,
    }) => {
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

        if (!confirm) return text(confirmPreview("L'opportunité", data));

        const result = await axelorCreate(CLASSES.opportunity, data);
        return text(result ? JSON.stringify(result, null, 2) : "Échec de la création de l'opportunité.");
    },
);

// ── Analyse produits (SaleOrderLine) ─────────────────────────────────────────

type SaleOrderLine = {
    id: number;
    typeSelect: number;
    productName?: string;
    product?: {
        id: number;
        code?: string;
        name?: string;
        "productFamily.name"?: string;
        "productCategory.name"?: string;
    };
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
                .describe(
                    "Axe d'agrégation : product (par produit, défaut), family (par famille), category (par catégorie)",
                ),
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
        if (clientName)
            criteria.push({ fieldName: "saleOrder.clientPartner.name", operator: "like", value: `%${clientName}%` });

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

        const sorted = [...groups.values()].sort((a, b) => b.exTaxTotal - a.exTaxTotal).slice(0, topN);

        const totalCA = sorted.reduce((s, g) => s + g.exTaxTotal, 0);
        const months = [
            ...new Set(lines.map((l) => l["saleOrder.orderDate"]?.substring(0, 7) ?? "").filter(Boolean)),
        ].sort();

        const rows = sorted.map((g) => {
            const pct = totalCA > 0 ? ((g.exTaxTotal / totalCA) * 100).toFixed(1) : "0.0";
            const monthCols = months
                .map((m) => `${(g.byMonth[m] ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`)
                .join(" | ");
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
                .describe(
                    "Type : customer_invoice=3, customer_refund=4, supplier_invoice=1, supplier_refund=2 (défaut : customer_invoice)",
                ),
            dateFrom: z.string().optional().describe("Date de facture minimale (YYYY-MM-DD)"),
            dateTo: z.string().optional().describe("Date de facture maximale (YYYY-MM-DD)"),
            dueDateTo: z.string().optional().describe("Échéance maximale (YYYY-MM-DD) — utile pour les impayés"),
            unpaidOnly: z
                .boolean()
                .optional()
                .describe("Si true, retourne uniquement les factures avec un montant restant dû > 0"),
            limit: z.number().optional().describe("Nombre de résultats (défaut : 20)"),
            offset: z.number().optional().describe("Décalage pour la pagination (défaut : 0)"),
        },
    },
    async ({
        partnerName,
        invoiceId,
        statusSelect,
        operationTypeSelect = "customer_invoice",
        dateFrom,
        dateTo,
        dueDateTo,
        unpaidOnly,
        limit,
        offset,
    }) => {
        const statusMap = { draft: 1, validated: 2, ventilated: 3, cancelled: 4 };
        const operationMap = { customer_invoice: 3, customer_refund: 4, supplier_invoice: 1, supplier_refund: 2 };

        const criteria: Criterion[] = [
            { fieldName: "operationTypeSelect", operator: "=", value: operationMap[operationTypeSelect] },
        ];

        if (partnerName) criteria.push({ fieldName: "partner.name", operator: "like", value: `%${partnerName}%` });
        if (invoiceId) criteria.push({ fieldName: "invoiceId", operator: "like", value: `%${invoiceId}%` });
        if (statusSelect) criteria.push({ fieldName: "statusSelect", operator: "=", value: statusMap[statusSelect] });
        if (dateFrom) criteria.push({ fieldName: "invoiceDate", operator: ">=", value: dateFrom });
        if (dateTo) criteria.push({ fieldName: "invoiceDate", operator: "<=", value: dateTo });
        if (dueDateTo) criteria.push({ fieldName: "dueDate", operator: "<=", value: dueDateTo });
        if (unpaidOnly) criteria.push({ fieldName: "amountRemaining", operator: ">", value: 0 });

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

// ── Écritures comptables (MoveLine) ───────────────────────────────────────────

server.registerTool(
    "search_move_lines",
    {
        description:
            "Rechercher des lignes d'écriture comptable (MoveLine) dans Axelor, en lecture seule. Filtres : partenaire, compte, journal, période, montant restant à payer/lettrer. Par défaut : lignes non soldées du mois en cours (ex : impayés clients/fournisseurs).",
        inputSchema: {
            partnerName: z.string().optional().describe("Nom (partiel) du partenaire (client ou fournisseur)"),
            accountName: z.string().optional().describe("Nom ou code (partiel) du compte comptable"),
            journalName: z.string().optional().describe("Nom ou code (partiel) du journal"),
            dateFrom: z.string().optional().describe("Date de début (YYYY-MM-DD). Défaut : 1er jour du mois en cours."),
            dateTo: z.string().optional().describe("Date de fin (YYYY-MM-DD). Défaut : dernier jour du mois en cours."),
            unpaidOnly: z
                .boolean()
                .optional()
                .describe("Si true (défaut), ne garde que les lignes avec un montant restant à payer/lettrer > 0"),
            limit: z.number().optional().describe("Nombre de résultats (défaut : 50)"),
            offset: z.number().optional().describe("Décalage pour la pagination (défaut : 0)"),
        },
    },
    async ({ partnerName, accountName, journalName, dateFrom, dateTo, unpaidOnly, limit, offset }) => {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const firstOfMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
        const lastOfMonthDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const lastOfMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastOfMonthDay)}`;

        const criteria: Criterion[] = [
            { fieldName: "partner", operator: "notNull", value: null },
            { fieldName: "date", operator: ">=", value: dateFrom ?? firstOfMonth },
            { fieldName: "date", operator: "<=", value: dateTo ?? lastOfMonth },
        ];

        if (partnerName) criteria.push({ fieldName: "partner.name", operator: "like", value: `%${partnerName}%` });
        if (accountName)
            criteria.push({
                operator: "or",
                criteria: [
                    { fieldName: "account.name", operator: "like", value: `%${accountName}%` },
                    { fieldName: "account.code", operator: "like", value: `%${accountName}%` },
                ],
            });
        if (journalName)
            criteria.push({ fieldName: "move.journal.name", operator: "like", value: `%${journalName}%` });
        if (unpaidOnly !== false) criteria.push({ fieldName: "amountRemaining", operator: ">", value: 0 });

        const { data, total } = await axelorSearch(CLASSES.moveLine, MOVE_LINE_FIELDS, criteria, {
            sortBy: ["-amountRemaining"],
            limit: limit ?? 50,
            offset: offset ?? 0,
        });
        return text(formatResult("ligne d'écriture", data, total));
    },
);

// ── Analyse des opportunités (CRM) ───────────────────────────────────────────

type OpportunityAnalysis = {
    id: number;
    name: string;
    amount: number | string | null;
    probability: number | string | null;
    worstCase: number | string | null;
    bestCase: number | string | null;
    expectedCloseDate: string | null;
    opportunityStatus: { id: number; name: string } | null;
    partner: { id: number; name: string } | null;
    user: { id: number; name: string } | null;
    source: { id: number; name: string } | null;
    createdOn: string | null;
};

type OppGroup = {
    key: string;
    count: number;
    totalAmount: number;
    weightedAmount: number;
    worstCase: number;
    bestCase: number;
    avgProbability: number;
};

function groupOpportunities(
    opps: OpportunityAnalysis[],
    groupBy: "status" | "salesperson" | "source" | "month",
): OppGroup[] {
    const map = new Map<string, OppGroup & { _probabilitySum: number }>();

    for (const o of opps) {
        let key: string;
        if (groupBy === "month") key = o.expectedCloseDate ? o.expectedCloseDate.slice(0, 7) : "sans date";
        else if (groupBy === "salesperson") key = o.user?.name ?? "non assigné";
        else if (groupBy === "source") key = o.source?.name ?? "sans source";
        else key = o.opportunityStatus?.name ?? "sans statut";

        const g = map.get(key) ?? {
            key,
            count: 0,
            totalAmount: 0,
            weightedAmount: 0,
            worstCase: 0,
            bestCase: 0,
            avgProbability: 0,
            _probabilitySum: 0,
        };
        const amount = Number(o.amount) || 0;
        const prob = Number(o.probability) || 0;
        g.count++;
        g.totalAmount += amount;
        g.weightedAmount += (amount * prob) / 100;
        g.worstCase += Number(o.worstCase) || 0;
        g.bestCase += Number(o.bestCase) || 0;
        g._probabilitySum += prob;
        map.set(key, g);
    }

    const groups: OppGroup[] = Array.from(map.values()).map(({ _probabilitySum, ...g }) => ({
        ...g,
        avgProbability: g.count > 0 ? Math.round((_probabilitySum / g.count) * 10) / 10 : 0,
    }));

    return groupBy === "month"
        ? groups.sort((a, b) => a.key.localeCompare(b.key))
        : groups.sort((a, b) => b.weightedAmount - a.weightedAmount);
}

server.registerTool(
    "analyze_opportunities",
    {
        description:
            "Analyse agrégée du pipeline CRM : montant total, pipeline pondéré (amount × probabilité), meilleur/pire cas. Groupé par statut, commercial, source ou mois de closing prévu. Filtres : période expectedCloseDate, client, commercial.",
        inputSchema: {
            groupBy: z
                .enum(["status", "salesperson", "source", "month"])
                .describe(
                    "Axe d'analyse : status (étapes du pipeline), salesperson (performance commerciaux), source (origine des opps), month (répartition par mois de closing prévu)",
                ),
            dateFrom: z.string().optional().describe("Date de closing prévue minimale (YYYY-MM-DD)"),
            dateTo: z.string().optional().describe("Date de closing prévue maximale (YYYY-MM-DD)"),
            partnerName: z.string().optional().describe("Filtrer par client / prospect (nom partiel)"),
            userName: z.string().optional().describe("Filtrer par commercial (nom partiel)"),
            includeArchived: z.boolean().optional().describe("Inclure les opportunités archivées (défaut : false)"),
            topN: z.number().optional().describe("Nombre de groupes à afficher (défaut : 20)"),
        },
    },
    async ({ groupBy, dateFrom, dateTo, partnerName, userName, includeArchived = false, topN = 20 }) => {
        const criteria: Criterion[] = [];

        if (dateFrom) criteria.push({ fieldName: "expectedCloseDate", operator: ">=", value: dateFrom });
        if (dateTo) criteria.push({ fieldName: "expectedCloseDate", operator: "<=", value: dateTo });
        if (partnerName) criteria.push({ fieldName: "partner.name", operator: "like", value: `%${partnerName}%` });
        if (userName) criteria.push({ fieldName: "user.name", operator: "like", value: `%${userName}%` });
        if (!includeArchived) criteria.push({ fieldName: "archived", operator: "=", value: false });
        if (criteria.length === 0) criteria.push({ fieldName: "id", operator: "notNull", value: null });

        const { data, total } = await axelorSearch(CLASSES.opportunity, OPPORTUNITY_ANALYSIS_FIELDS, criteria, {
            limit: 2000,
            sortBy: ["expectedCloseDate"],
        });

        const opps = data as OpportunityAnalysis[];
        const allGroups = groupOpportunities(opps, groupBy);
        const displayed = allGroups.slice(0, topN);

        const periode = dateFrom || dateTo ? `${dateFrom ?? "…"} → ${dateTo ?? "…"}` : "toutes périodes";
        const lines: string[] = [
            `Analyse opportunités — groupBy: ${groupBy} | Période closing: ${periode}`,
            `${opps.length} opportunité(s) analysée(s) sur ${total} au total`,
            "",
            `Rang | ${"Groupe".padEnd(28)} | Nb  | ${"Montant total".padStart(14)} | ${"Pipeline pondéré".padStart(16)} | ${"Pire cas".padStart(12)} | ${"Meilleur cas".padStart(12)} | Prob. moy`,
            `-----|${"-".repeat(30)}|-----|${"-".repeat(16)}|${"-".repeat(18)}|${"-".repeat(14)}|${"-".repeat(14)}|----------`,
        ];

        displayed.forEach((g, i) => {
            lines.push(
                `${String(i + 1).padStart(4)} | ${g.key.padEnd(28)} | ${String(g.count).padStart(3)} | ${fmt(g.totalAmount).padStart(14)} | ${fmt(g.weightedAmount).padStart(16)} | ${fmt(g.worstCase).padStart(12)} | ${fmt(g.bestCase).padStart(12)} | ${String(g.avgProbability.toFixed(1) + " %").padStart(9)}`,
            );
        });

        const tot = allGroups.reduce(
            (acc, g) => ({
                count: acc.count + g.count,
                totalAmount: acc.totalAmount + g.totalAmount,
                weightedAmount: acc.weightedAmount + g.weightedAmount,
                worstCase: acc.worstCase + g.worstCase,
                bestCase: acc.bestCase + g.bestCase,
            }),
            { count: 0, totalAmount: 0, weightedAmount: 0, worstCase: 0, bestCase: 0 },
        );

        lines.push(
            `-----|${"-".repeat(30)}|-----|${"-".repeat(16)}|${"-".repeat(18)}|${"-".repeat(14)}|${"-".repeat(14)}|----------`,
        );
        lines.push(
            `TOTAL| ${"—".padEnd(28)} | ${String(tot.count).padStart(3)} | ${fmt(tot.totalAmount).padStart(14)} | ${fmt(tot.weightedAmount).padStart(16)} | ${fmt(tot.worstCase).padStart(12)} | ${fmt(tot.bestCase).padStart(12)} |`,
        );

        if (opps.length < total) {
            lines.push(
                "",
                `⚠ Seules ${opps.length} opportunités sur ${total} ont été analysées (limite 2000) — affiner les filtres.`,
            );
        }

        return text(lines.join("\n"));
    },
);

// ── Projets ───────────────────────────────────────────────────────────────────

server.registerTool(
    "search_projects",
    {
        description:
            "Rechercher des projets dans Axelor. Filtres : client, responsable, statut, projets en retard (toDate dépassée). Inclut consommé vs vendu (soldTime, spentTime), avancement et données financières.",
        inputSchema: {
            clientName: z.string().optional().describe("Nom (partiel) du client (clientPartner)"),
            assignedToName: z.string().optional().describe("Nom (partiel) du responsable (assignedTo)"),
            projectStatusName: z.string().optional().describe("Nom (partiel) du statut projet (ex: En cours, Terminé)"),
            isOverdue: z
                .boolean()
                .optional()
                .describe("Si true, retourne uniquement les projets dont la date de fin (toDate) est dépassée"),
            isBusinessProject: z
                .boolean()
                .optional()
                .describe("Filtrer les projets commerciaux (isBusinessProject = true)"),
            archived: z.boolean().optional().describe("Inclure les projets archivés (défaut : false)"),
            limit: z.number().optional().describe("Nombre de résultats (défaut : 20)"),
            offset: z.number().optional().describe("Décalage pour la pagination (défaut : 0)"),
        },
    },
    async ({
        clientName,
        assignedToName,
        projectStatusName,
        isOverdue,
        isBusinessProject,
        archived,
        limit,
        offset,
    }) => {
        const today = new Date().toISOString().split("T")[0];
        const criteria: Criterion[] = [];

        if (clientName) criteria.push({ fieldName: "clientPartner.name", operator: "like", value: `%${clientName}%` });
        if (assignedToName)
            criteria.push({ fieldName: "assignedTo.name", operator: "like", value: `%${assignedToName}%` });
        if (projectStatusName)
            criteria.push({ fieldName: "projectStatus.name", operator: "like", value: `%${projectStatusName}%` });
        if (isOverdue) criteria.push({ fieldName: "toDate", operator: "<", value: today });
        if (isBusinessProject !== undefined)
            criteria.push({ fieldName: "isBusinessProject", operator: "=", value: isBusinessProject });
        if (!archived) criteria.push({ fieldName: "archived", operator: "=", value: false });
        if (criteria.length === 0) criteria.push({ fieldName: "id", operator: "notNull", value: null });

        const { data, total } = await axelorSearch(CLASSES.project, PROJECT_FIELDS, criteria, {
            sortBy: ["toDate"],
            limit: limit ?? 20,
            offset: offset ?? 0,
        });
        return text(formatResult("projet", data, total));
    },
);

type ProjectAnalysis = {
    id: number;
    name: string;
    clientPartner: { id: number; name: string } | null;
    assignedTo: { id: number; name: string } | null;
    projectStatus: { id: number; name: string } | null;
    fromDate: string | null;
    toDate: string | null;
    soldTime: number | string | null;
    spentTime: number | string | null;
    plannedTime: number | string | null;
    percentageOfProgress: number | string | null;
    percentageOfConsumption: number | string | null;
    totalInvoiced: number | string | null;
    totalRealCosts: number | string | null;
    isBusinessProject: boolean | null;
};

type ProjectGroup = {
    key: string;
    count: number;
    soldTime: number;
    spentTime: number;
    plannedTime: number;
    totalInvoiced: number;
    totalRealCosts: number;
    avgConsumption: number;
    overdueCount: number;
};

function groupProjects(
    projects: ProjectAnalysis[],
    groupBy: "client" | "assignedTo" | "status",
    today: string,
): ProjectGroup[] {
    const map = new Map<string, ProjectGroup & { _consumptionSum: number }>();

    for (const p of projects) {
        let key: string;
        if (groupBy === "client") key = p.clientPartner?.name ?? "sans client";
        else if (groupBy === "assignedTo") key = p.assignedTo?.name ?? "non assigné";
        else key = p.projectStatus?.name ?? "sans statut";

        const g = map.get(key) ?? {
            key,
            count: 0,
            soldTime: 0,
            spentTime: 0,
            plannedTime: 0,
            totalInvoiced: 0,
            totalRealCosts: 0,
            avgConsumption: 0,
            overdueCount: 0,
            _consumptionSum: 0,
        };
        g.count++;
        g.soldTime += Number(p.soldTime) || 0;
        g.spentTime += Number(p.spentTime) || 0;
        g.plannedTime += Number(p.plannedTime) || 0;
        g.totalInvoiced += Number(p.totalInvoiced) || 0;
        g.totalRealCosts += Number(p.totalRealCosts) || 0;
        g._consumptionSum += Number(p.percentageOfConsumption) || 0;
        if (p.toDate && p.toDate < today) g.overdueCount++;
        map.set(key, g);
    }

    return Array.from(map.values())
        .map(({ _consumptionSum, ...g }) => ({
            ...g,
            avgConsumption: g.count > 0 ? Math.round((_consumptionSum / g.count) * 10) / 10 : 0,
        }))
        .sort((a, b) => b.count - a.count);
}

server.registerTool(
    "analyze_projects",
    {
        description:
            "Analyse agrégée des projets : temps vendu vs consommé vs planifié, CA facturé, coûts réels, projets en retard. Groupé par client, responsable ou statut. Filtres : client, responsable, retard, projets commerciaux.",
        inputSchema: {
            groupBy: z
                .enum(["client", "assignedTo", "status"])
                .describe(
                    "Axe d'analyse : client (répartition par client), assignedTo (charge par responsable), status (répartition par statut)",
                ),
            clientName: z.string().optional().describe("Filtrer par client (nom partiel)"),
            assignedToName: z.string().optional().describe("Filtrer par responsable (nom partiel)"),
            isOverdue: z
                .boolean()
                .optional()
                .describe("Si true, restreindre aux projets dont la date de fin est dépassée"),
            isBusinessProject: z.boolean().optional().describe("Filtrer les projets commerciaux uniquement"),
            includeArchived: z.boolean().optional().describe("Inclure les projets archivés (défaut : false)"),
            topN: z.number().optional().describe("Nombre de groupes à afficher (défaut : 20)"),
        },
    },
    async ({
        groupBy,
        clientName,
        assignedToName,
        isOverdue,
        isBusinessProject,
        includeArchived = false,
        topN = 20,
    }) => {
        const today = new Date().toISOString().split("T")[0];
        const criteria: Criterion[] = [];

        if (clientName) criteria.push({ fieldName: "clientPartner.name", operator: "like", value: `%${clientName}%` });
        if (assignedToName)
            criteria.push({ fieldName: "assignedTo.name", operator: "like", value: `%${assignedToName}%` });
        if (isOverdue) criteria.push({ fieldName: "toDate", operator: "<", value: today });
        if (isBusinessProject !== undefined)
            criteria.push({ fieldName: "isBusinessProject", operator: "=", value: isBusinessProject });
        if (!includeArchived) criteria.push({ fieldName: "archived", operator: "=", value: false });
        if (criteria.length === 0) criteria.push({ fieldName: "id", operator: "notNull", value: null });

        const { data, total } = await axelorSearch(CLASSES.project, PROJECT_ANALYSIS_FIELDS, criteria, {
            limit: 2000,
        });

        const projects = data as ProjectAnalysis[];
        const allGroups = groupProjects(projects, groupBy, today);
        const displayed = allGroups.slice(0, topN);

        const fmtH = (h: number) => `${h.toFixed(1)} h`;

        const lines: string[] = [
            `Analyse projets — groupBy: ${groupBy}`,
            `${projects.length} projet(s) analysé(s) sur ${total} au total`,
            "",
            `Rang | ${"Groupe".padEnd(28)} | Nb  | En retard | ${"Vendu".padStart(8)} | ${"Consommé".padStart(8)} | ${"Planifié".padStart(8)} | Conso% moy | ${"Facturé".padStart(12)} | ${"Coûts réels".padStart(12)}`,
            `-----|${"-".repeat(30)}|-----|-----------|${"-".repeat(10)}|${"-".repeat(10)}|${"-".repeat(10)}|------------|${"-".repeat(14)}|${"-".repeat(14)}`,
        ];

        displayed.forEach((g, i) => {
            lines.push(
                `${String(i + 1).padStart(4)} | ${g.key.padEnd(28)} | ${String(g.count).padStart(3)} | ${String(g.overdueCount).padStart(9)} | ${fmtH(g.soldTime).padStart(8)} | ${fmtH(g.spentTime).padStart(8)} | ${fmtH(g.plannedTime).padStart(8)} | ${String(g.avgConsumption.toFixed(1) + " %").padStart(10)} | ${fmt(g.totalInvoiced).padStart(12)} | ${fmt(g.totalRealCosts).padStart(12)}`,
            );
        });

        const tot = allGroups.reduce(
            (acc, g) => ({
                count: acc.count + g.count,
                overdueCount: acc.overdueCount + g.overdueCount,
                soldTime: acc.soldTime + g.soldTime,
                spentTime: acc.spentTime + g.spentTime,
                plannedTime: acc.plannedTime + g.plannedTime,
                totalInvoiced: acc.totalInvoiced + g.totalInvoiced,
                totalRealCosts: acc.totalRealCosts + g.totalRealCosts,
            }),
            {
                count: 0,
                overdueCount: 0,
                soldTime: 0,
                spentTime: 0,
                plannedTime: 0,
                totalInvoiced: 0,
                totalRealCosts: 0,
            },
        );

        lines.push(
            `-----|${"-".repeat(30)}|-----|-----------|${"-".repeat(10)}|${"-".repeat(10)}|${"-".repeat(10)}|------------|${"-".repeat(14)}|${"-".repeat(14)}`,
        );
        lines.push(
            `TOTAL| ${"—".padEnd(28)} | ${String(tot.count).padStart(3)} | ${String(tot.overdueCount).padStart(9)} | ${fmtH(tot.soldTime).padStart(8)} | ${fmtH(tot.spentTime).padStart(8)} | ${fmtH(tot.plannedTime).padStart(8)} |            | ${fmt(tot.totalInvoiced).padStart(12)} | ${fmt(tot.totalRealCosts).padStart(12)}`,
        );

        if (projects.length < total) {
            lines.push(
                "",
                `⚠ Seuls ${projects.length} projets sur ${total} ont été analysés (limite 2000) — affiner les filtres.`,
            );
        }

        return text(lines.join("\n"));
    },
);

// ── Feuilles de temps (Timesheet) ────────────────────────────────────────────

/*
  statusSelect :
    1 = Brouillon
    2 = En attente de validation
    3 = Validée
    4 = Refusée
*/

server.registerTool(
    "search_timesheets",
    {
        description:
            "Rechercher des feuilles de temps (Timesheet) dans Axelor. Filtres : employé, statut, période couverte.",
        inputSchema: {
            employeeName: z.string().optional().describe("Nom (partiel) de l'employé"),
            statusSelect: z
                .enum(["draft", "waiting", "validated", "refused"])
                .optional()
                .describe("Statut : draft=1, waiting=2, validated=3, refused=4"),
            dateFrom: z
                .string()
                .optional()
                .describe("Période minimale de début de feuille (YYYY-MM-DD) — filtre sur fromDate"),
            dateTo: z
                .string()
                .optional()
                .describe("Période maximale de fin de feuille (YYYY-MM-DD) — filtre sur toDate"),
            limit: z.number().optional().describe("Nombre de résultats (défaut : 20)"),
            offset: z.number().optional().describe("Décalage pour la pagination (défaut : 0)"),
        },
    },
    async ({ employeeName, statusSelect, dateFrom, dateTo, limit, offset }) => {
        const statusMap = { draft: 1, waiting: 2, validated: 3, refused: 4 };
        const criteria: Criterion[] = [];

        if (employeeName) criteria.push({ fieldName: "employee.name", operator: "like", value: `%${employeeName}%` });
        if (statusSelect) criteria.push({ fieldName: "statusSelect", operator: "=", value: statusMap[statusSelect] });
        if (dateFrom) criteria.push({ fieldName: "fromDate", operator: ">=", value: dateFrom });
        if (dateTo) criteria.push({ fieldName: "toDate", operator: "<=", value: dateTo });
        if (criteria.length === 0) criteria.push({ fieldName: "id", operator: "notNull", value: null });

        const { data, total } = await axelorSearch(CLASSES.timesheet, TIMESHEET_FIELDS, criteria, {
            sortBy: ["-fromDate"],
            limit: limit ?? 20,
            offset: offset ?? 0,
        });
        return text(formatResult("feuille de temps", data, total));
    },
);

server.registerTool(
    "get_timesheet",
    {
        description: "Obtenir tous les détails d'une feuille de temps Axelor par son ID, incluant les lignes saisies.",
        inputSchema: {
            id: z.number().describe("ID de la feuille de temps (champ 'id' retourné par search_timesheets)"),
        },
    },
    async ({ id }) => {
        const ts = await axelorGetById(CLASSES.timesheet, id);
        return text(ts ? JSON.stringify(ts, null, 2) : `Feuille de temps ID ${id} introuvable.`);
    },
);

// ── Résumé temps passé par projet / employé (TimesheetLine) ──────────────────

type TimesheetLineData = {
    id: number;
    date: string | null;
    hoursDuration: number | string | null;
    comments?: string;
    timesheet?: {
        id: number;
        employee?: { id: number; name: string } | null;
        statusSelect?: number;
    };
    project?: { id: number; name: string } | null;
    projectTask?: { id: number; name: string } | null;
};

type TimeGroup = {
    key: string;
    totalHours: number;
    lineCount: number;
    taskBreakdown: Record<string, number>;
};

function groupTimesheetLines(lines: TimesheetLineData[], groupBy: "project" | "employee"): TimeGroup[] {
    const map = new Map<string, TimeGroup>();

    for (const line of lines) {
        const hours = Number(line.hoursDuration) || 0;
        const taskName = line.projectTask?.name ?? "Sans tâche";

        let key: string;
        if (groupBy === "employee") {
            key = line.timesheet?.employee?.name ?? "Non assigné";
        } else {
            key = line.project?.name ?? "Sans projet";
        }

        const g = map.get(key) ?? { key, totalHours: 0, lineCount: 0, taskBreakdown: {} };
        g.totalHours += hours;
        g.lineCount++;
        g.taskBreakdown[taskName] = (g.taskBreakdown[taskName] ?? 0) + hours;
        map.set(key, g);
    }

    return [...map.values()].sort((a, b) => b.totalHours - a.totalHours);
}

server.registerTool(
    "summary_timesheet_by_project",
    {
        description:
            "Résumé du temps passé agrégé par projet ou employé. Groupable par projet (défaut) ou employee. Filtres : période obligatoire, employé, projet.",
        inputSchema: {
            dateFrom: z.string().describe("Date de début (YYYY-MM-DD)"),
            dateTo: z.string().describe("Date de fin (YYYY-MM-DD)"),
            groupBy: z
                .enum(["project", "employee"])
                .optional()
                .describe("Axe d'agrégation : project (défaut) ou employee"),
            employeeName: z.string().optional().describe("Filtrer par employé (nom partiel)"),
            projectName: z.string().optional().describe("Filtrer par projet (nom partiel)"),
            topN: z.number().optional().describe("Nombre de groupes à afficher (défaut : 20)"),
        },
    },
    async ({ dateFrom, dateTo, groupBy = "project", employeeName, projectName, topN = 20 }) => {
        const criteria: Criterion[] = [
            { fieldName: "date", operator: ">=", value: dateFrom },
            { fieldName: "date", operator: "<=", value: dateTo },
        ];

        if (employeeName)
            criteria.push({ fieldName: "timesheet.employee.name", operator: "like", value: `%${employeeName}%` });
        if (projectName) criteria.push({ fieldName: "project.name", operator: "like", value: `%${projectName}%` });

        const { data, total } = await axelorSearch(CLASSES.timesheetLine, TIMESHEET_LINE_FIELDS, criteria, {
            limit: 2000,
            sortBy: ["date"],
        });

        const lines = data as TimesheetLineData[];
        const allGroups = groupTimesheetLines(lines, groupBy);
        const displayed = allGroups.slice(0, topN);

        const fmtH = (h: number) => `${h.toFixed(1)} h`;

        const output: string[] = [
            `Résumé temps passé — groupBy: ${groupBy} | Période: ${dateFrom} → ${dateTo}`,
            `${lines.length} ligne(s) analysée(s) sur ${total} au total`,
            "",
        ];

        if (groupBy === "project") {
            output.push(
                `Rang | ${"Projet".padEnd(28)} | ${"Heures".padStart(8)} | Lignes | ${"Tâches principales".padEnd(40)}`,
                `-----|${"-".repeat(30)}|${"-".repeat(10)}|--------|${"-".repeat(42)}`,
            );
            displayed.forEach((g, i) => {
                const topTasks = Object.entries(g.taskBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([t, h]) => `${t} (${fmtH(h)})`)
                    .join(", ");
                output.push(
                    `${String(i + 1).padStart(4)} | ${g.key.padEnd(28)} | ${fmtH(g.totalHours).padStart(8)} | ${String(g.lineCount).padStart(6)} | ${topTasks}`,
                );
            });
        } else {
            output.push(
                `Rang | ${"Employé".padEnd(28)} | ${"Heures".padStart(8)} | Lignes | ${"Projets concernés".padEnd(40)}`,
                `-----|${"-".repeat(30)}|${"-".repeat(10)}|--------|${"-".repeat(42)}`,
            );
            displayed.forEach((g, i) => {
                const topProjects = Object.entries(g.taskBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([p, h]) => `${p} (${fmtH(h)})`)
                    .join(", ");
                output.push(
                    `${String(i + 1).padStart(4)} | ${g.key.padEnd(28)} | ${fmtH(g.totalHours).padStart(8)} | ${String(g.lineCount).padStart(6)} | ${topProjects}`,
                );
            });
        }

        const tot = allGroups.reduce(
            (acc, g) => ({
                totalHours: acc.totalHours + g.totalHours,
                lineCount: acc.lineCount + g.lineCount,
            }),
            { totalHours: 0, lineCount: 0 },
        );

        output.push(
            `-----|${"-".repeat(30)}|${"-".repeat(10)}|--------|${"-".repeat(42)}`,
            `TOTAL| ${"—".padEnd(28)} | ${fmtH(tot.totalHours).padStart(8)} | ${String(tot.lineCount).padStart(6)} |`,
        );

        if (lines.length < total) {
            output.push(
                "",
                `⚠ Seules ${lines.length} lignes sur ${total} ont été analysées (limite 2000) — affiner la période.`,
            );
        }

        return text(output.join("\n"));
    },
);

// ── Synthèse des tâches d'une affaire (ProjectTask) ──────────────────────────

type ProjectTask = {
    id: number;
    name: string;
    project?: { id: number; name: string } | null;
    taskStatus?: { id: number; name: string } | null;
    assignedTo?: { id: number; name: string } | null;
    priority?: { id: number; name: string } | null;
    parentTask?: { id: number; name: string } | null;
    taskDate?: string | null;
    taskDeadline?: string | null;
    progressSelect?: number | null;
    estimatedTime?: number | string | null;
    plannedTime?: number | string | null;
    spentTime?: number | string | null;
};

server.registerTool(
    "get_project_tasks_summary",
    {
        description:
            "Synthèse des tâches d'une affaire (projet commercial) : répartition par statut, par responsable, tâches en retard, avancement global, heures estimées vs consommées. Passer projectId ou projectName.",
        inputSchema: {
            projectId: z.number().optional().describe("ID de l'affaire (Project)"),
            projectName: z.string().optional().describe("Nom (partiel) de l'affaire si l'ID n'est pas connu"),
            excludeCompletedStatuses: z
                .array(z.string())
                .optional()
                .describe(
                    "Noms exacts des statuts à considérer comme terminés pour les exclure du résumé (ex: ['Terminé', 'Annulé']). Par défaut aucun statut n'est exclu.",
                ),
        },
    },
    async ({ projectId, projectName, excludeCompletedStatuses = [] }) => {
        if (!projectId && !projectName) return text("Fournir projectId ou projectName.");

        const criteria: Criterion[] = [];
        if (projectId) {
            criteria.push({ fieldName: "project.id", operator: "=", value: projectId });
        } else {
            criteria.push({ fieldName: "project.name", operator: "like", value: `%${projectName}%` });
        }

        const { data, total } = await axelorSearch(CLASSES.projectTask, PROJECT_TASK_FIELDS, criteria, {
            limit: 500,
            sortBy: ["taskDeadline"],
        });

        const tasks = data as ProjectTask[];
        if (tasks.length === 0) return text("Aucune tâche trouvée pour cette affaire.");

        const today = new Date().toISOString().split("T")[0];
        const excludedSet = new Set(excludeCompletedStatuses.map((s) => s.toLowerCase()));

        // ── Regroupements ──────────────────────────────────────────────────────
        const byStatus = new Map<string, ProjectTask[]>();
        const byAssignee = new Map<string, { tasks: ProjectTask[]; spentTime: number; estimatedTime: number }>();
        const overdue: ProjectTask[] = [];
        const unassigned: ProjectTask[] = [];

        let totalEstimated = 0;
        let totalSpent = 0;
        let totalProgress = 0;
        let progressCount = 0;

        for (const t of tasks) {
            const status = t.taskStatus?.name ?? "Sans statut";
            const assignee = t.assignedTo?.name ?? null;
            const est = Number(t.estimatedTime) || 0;
            const spent = Number(t.spentTime) || 0;
            const progress = t.progressSelect != null ? Number(t.progressSelect) : null;

            totalEstimated += est;
            totalSpent += spent;
            if (progress !== null) {
                totalProgress += progress;
                progressCount++;
            }

            if (!byStatus.has(status)) byStatus.set(status, []);
            byStatus.get(status)!.push(t);

            if (assignee) {
                const g = byAssignee.get(assignee) ?? { tasks: [], spentTime: 0, estimatedTime: 0 };
                g.tasks.push(t);
                g.spentTime += spent;
                g.estimatedTime += est;
                byAssignee.set(assignee, g);
            } else {
                unassigned.push(t);
            }

            if (t.taskDeadline && t.taskDeadline < today && !excludedSet.has(status.toLowerCase())) {
                overdue.push(t);
            }
        }

        const avgProgress = progressCount > 0 ? Math.round(totalProgress / progressCount) : null;
        const fmtH = (h: number) => `${h.toFixed(1)} h`;
        const lines: string[] = [];

        // En-tête affaire
        const projectLabel = tasks[0]?.project?.name ?? projectName ?? `ID ${projectId}`;
        lines.push(`Synthèse des tâches — Affaire : ${projectLabel}`);
        lines.push(`${tasks.length} tâche(s) récupérée(s) sur ${total} au total`);
        if (avgProgress !== null) lines.push(`Avancement moyen : ${avgProgress} %`);
        lines.push(`Temps estimé total : ${fmtH(totalEstimated)} | Temps consommé : ${fmtH(totalSpent)}`);
        lines.push("");

        // Répartition par statut
        lines.push("── Répartition par statut ──────────────────────────────────");
        const sortedStatuses = [...byStatus.entries()].sort((a, b) => b[1].length - a[1].length);
        for (const [status, ts] of sortedStatuses) {
            const isExcluded = excludedSet.has(status.toLowerCase()) ? " ✓" : "";
            lines.push(`  ${status}${isExcluded} : ${ts.length} tâche(s)`);
        }
        lines.push("");

        // Tâches en retard
        if (overdue.length > 0) {
            lines.push(`── ⚠ Tâches en retard (deadline dépassée) : ${overdue.length} ──────`);
            for (const t of overdue) {
                const who = t.assignedTo?.name ?? "Non assignée";
                const status = t.taskStatus?.name ?? "?";
                lines.push(`  • [${status}] ${t.name} — ${who} — échéance : ${t.taskDeadline}`);
            }
            lines.push("");
        }

        // Tâches non assignées
        if (unassigned.length > 0) {
            lines.push(`── Tâches sans responsable : ${unassigned.length} ──────────────────`);
            for (const t of unassigned.slice(0, 10)) {
                const status = t.taskStatus?.name ?? "?";
                lines.push(`  • [${status}] ${t.name}`);
            }
            if (unassigned.length > 10) lines.push(`  … et ${unassigned.length - 10} autre(s)`);
            lines.push("");
        }

        // Charge par responsable
        lines.push("── Charge par responsable ──────────────────────────────────");
        const sortedAssignees = [...byAssignee.entries()].sort((a, b) => b[1].tasks.length - a[1].tasks.length);
        for (const [name, g] of sortedAssignees) {
            const consoPct =
                g.estimatedTime > 0 ? ` (${Math.round((g.spentTime / g.estimatedTime) * 100)} % consommé)` : "";
            lines.push(
                `  ${name} : ${g.tasks.length} tâche(s) — estimé ${fmtH(g.estimatedTime)} / consommé ${fmtH(g.spentTime)}${consoPct}`,
            );
        }
        if (unassigned.length > 0) lines.push(`  Non assigné : ${unassigned.length} tâche(s)`);
        lines.push("");

        // Détail des tâches actives (hors statuts terminés)
        const activeTasks = tasks.filter((t) => !excludedSet.has((t.taskStatus?.name ?? "").toLowerCase()));
        if (activeTasks.length > 0) {
            lines.push(`── Détail des tâches actives (${activeTasks.length}) ──────────────────`);
            lines.push(
                `${"Statut".padEnd(18)} | ${"Responsable".padEnd(20)} | ${"Avancement".padStart(10)} | ${"Échéance".padEnd(12)} | Intitulé`,
            );
            lines.push(`${"-".repeat(18)}-|-${"-".repeat(20)}-|-${"-".repeat(10)}-|-${"-".repeat(12)}-|--------`);
            for (const t of activeTasks.slice(0, 50)) {
                const status = (t.taskStatus?.name ?? "?").padEnd(18);
                const who = (t.assignedTo?.name ?? "—").padEnd(20);
                const prog =
                    t.progressSelect != null ? `${t.progressSelect} %`.padStart(10) : "         ?".padStart(10);
                const deadline = (t.taskDeadline ?? "—").padEnd(12);
                const overdueMark = t.taskDeadline && t.taskDeadline < today ? " ⚠" : "";
                lines.push(`${status} | ${who} | ${prog} | ${deadline} | ${t.name}${overdueMark}`);
            }
            if (activeTasks.length > 50)
                lines.push(`… et ${activeTasks.length - 50} autre(s) tâche(s) non affichée(s)`);
        }

        if (tasks.length < total) {
            lines.push("", `⚠ Seules ${tasks.length} tâches sur ${total} ont été analysées (limite 500).`);
        }

        return text(lines.join("\n"));
    },
);

// ── Postes RH (JobPosition) ───────────────────────────────────────────────────

/*
  statusSelect :
    1 = Brouillon
    2 = Ouvert
    3 = En attente
    4 = Fermé
    5 = Annulé

  experienceSelect :
    1 = 0-2 ans
    2 = 2-5 ans
    3 = 5-10 ans
    4 = +10 ans
*/

server.registerTool(
    "search_job_positions",
    {
        description:
            "Rechercher des postes à pourvoir (JobPosition) dans Axelor. Filtres : intitulé, statut, société, département, type de contrat, archivé.",
        inputSchema: {
            jobTitle: z.string().optional().describe("Intitulé du poste (partiel)"),
            statusSelect: z
                .enum(["draft", "open", "waiting", "closed", "cancelled"])
                .optional()
                .describe("Statut du poste : draft=1, open=2, waiting=3, closed=4, cancelled=5"),
            companyName: z.string().optional().describe("Nom (partiel) de la société"),
            departmentName: z.string().optional().describe("Nom (partiel) du département (companyDepartment)"),
            contractTypeName: z.string().optional().describe("Nom (partiel) du type de contrat"),
            archived: z.boolean().optional().describe("Inclure les postes archivés (défaut : false)"),
            limit: z.number().optional().describe("Nombre de résultats (défaut : 20)"),
            offset: z.number().optional().describe("Décalage pour la pagination (défaut : 0)"),
        },
    },
    async ({ jobTitle, statusSelect, companyName, departmentName, contractTypeName, archived, limit, offset }) => {
        const statusMap = { draft: 1, open: 2, waiting: 3, closed: 4, cancelled: 5 };
        const criteria: Criterion[] = [];

        if (jobTitle) criteria.push({ fieldName: "jobTitle", operator: "like", value: `%${jobTitle}%` });
        if (statusSelect) criteria.push({ fieldName: "statusSelect", operator: "=", value: statusMap[statusSelect] });
        if (companyName) criteria.push({ fieldName: "company.name", operator: "like", value: `%${companyName}%` });
        if (departmentName)
            criteria.push({ fieldName: "companyDepartment.name", operator: "like", value: `%${departmentName}%` });
        if (contractTypeName)
            criteria.push({ fieldName: "contractType.name", operator: "like", value: `%${contractTypeName}%` });
        if (!archived) criteria.push({ fieldName: "archived", operator: "=", value: false });
        if (criteria.length === 0) criteria.push({ fieldName: "id", operator: "notNull", value: null });

        const { data, total } = await axelorSearch(CLASSES.jobPosition, JOB_POSITION_FIELDS, criteria, {
            sortBy: ["-publicationDate"],
            limit: limit ?? 20,
            offset: offset ?? 0,
        });
        return text(formatResult("poste à pourvoir", data, total));
    },
);

server.registerTool(
    "get_job_position",
    {
        description: "Obtenir tous les détails d'un poste à pourvoir (JobPosition) Axelor par son ID",
        inputSchema: {
            id: z.number().describe("ID du poste (champ 'id' retourné par search_job_positions)"),
        },
    },
    async ({ id }) => {
        const job = await axelorGetById(CLASSES.jobPosition, id);
        return text(job ? JSON.stringify(job, null, 2) : `Poste ID ${id} introuvable.`);
    },
);

server.registerTool(
    "create_job_position",
    {
        description: "Créer un poste à pourvoir (JobPosition) dans Axelor. Retourne le poste créé avec son ID.",
        inputSchema: {
            jobTitle: z.string().describe("Intitulé du poste"),
            companyId: z.number().optional().describe("ID de la société"),
            companyDepartmentId: z.number().optional().describe("ID du département (CompanyDepartment)"),
            employeeId: z.number().optional().describe("ID du responsable du recrutement (Employee)"),
            contractTypeId: z.number().optional().describe("ID du type de contrat (EmploymentContractType)"),
            location: z.string().optional().describe("Emplacement / lieu du poste"),
            nbOpenJob: z.number().optional().describe("Nombre de postes ouverts (défaut : 1)"),
            salary: z.string().optional().describe("Salaire (texte libre, ex: '35 000 - 40 000 €')"),
            experienceSelect: z
                .enum(["0-2", "2-5", "5-10", "+10"])
                .optional()
                .describe("Expérience requise : 0-2=1, 2-5=2, 5-10=3, +10=4"),
            publicationDate: z.string().optional().describe("Date de publication (YYYY-MM-DD)"),
            startingDate: z.string().optional().describe("Date de prise de poste (YYYY-MM-DD)"),
            jobDescription: z.string().optional().describe("Description de l'offre"),
            profileWanted: z.string().optional().describe("Profil recherché"),
            confirm: z
                .boolean()
                .optional()
                .describe(
                    "Mettre à true uniquement après validation explicite de l'utilisateur. Sans ce paramètre (ou false), l'outil renvoie un aperçu du poste sans rien créer.",
                ),
        },
    },
    async ({
        jobTitle,
        companyId,
        companyDepartmentId,
        employeeId,
        contractTypeId,
        location,
        nbOpenJob,
        salary,
        experienceSelect,
        publicationDate,
        startingDate,
        jobDescription,
        profileWanted,
        confirm,
    }) => {
        const experienceMap = { "0-2": 1, "2-5": 2, "5-10": 3, "+10": 4 };
        const data: Record<string, unknown> = { jobTitle };

        if (companyId !== undefined) data.company = { id: companyId };
        if (companyDepartmentId !== undefined) data.companyDepartment = { id: companyDepartmentId };
        if (employeeId !== undefined) data.employee = { id: employeeId };
        if (contractTypeId !== undefined) data.contractType = { id: contractTypeId };
        if (location !== undefined) data.location = location;
        if (nbOpenJob !== undefined) data.nbOpenJob = nbOpenJob;
        if (salary !== undefined) data.salary = salary;
        if (experienceSelect !== undefined) data.experienceSelect = experienceMap[experienceSelect];
        if (publicationDate !== undefined) data.publicationDate = publicationDate;
        if (startingDate !== undefined) data.startingDate = startingDate;
        if (jobDescription !== undefined) data.jobDescription = jobDescription;
        if (profileWanted !== undefined) data.profileWanted = profileWanted;

        if (!confirm) return text(confirmPreview("Le poste à pourvoir", data));

        const result = await axelorCreate(CLASSES.jobPosition, data);
        return text(result ? JSON.stringify(result, null, 2) : "Échec de la création du poste.");
    },
);

// ── TraceBack (debug) ─────────────────────────────────────────────────────────

server.registerTool(
    "search_tracebacks",
    {
        description:
            "Rechercher des anomalies / erreurs (TraceBack) dans Axelor. Filtres : période, catégorie, origine, utilisateur, archivé. Ne retourne pas la stack trace complète — utiliser get_traceback pour le détail.",
        inputSchema: {
            dateFrom: z.string().optional().describe("Date minimale (YYYY-MM-DD)"),
            dateTo: z.string().optional().describe("Date maximale (YYYY-MM-DD)"),
            category: z
                .enum(["non_bloquant", "bloquant", "fonctionnel"])
                .optional()
                .describe("Catégorie : non_bloquant=1, bloquant=2, fonctionnel=3"),
            origin: z.string().optional().describe("Origine (partielle) de l'erreur"),
            exception: z.string().optional().describe("Nom de l'exception (partiel)"),
            userName: z.string().optional().describe("Nom (partiel) de l'utilisateur concerné"),
            includeArchived: z.boolean().optional().describe("Inclure les anomalies archivées (défaut : false)"),
            limit: z.number().optional().describe("Nombre de résultats (défaut : 20)"),
            offset: z.number().optional().describe("Décalage pour la pagination (défaut : 0)"),
        },
    },
    async ({ dateFrom, dateTo, category, origin, exception, userName, includeArchived = false, limit = 20, offset = 0 }) => {
        const categoryMap = { non_bloquant: 1, bloquant: 2, fonctionnel: 3 };
        const criteria: Criterion[] = [];

        if (!includeArchived) criteria.push({ fieldName: "archived", operator: "=", value: false });
        if (dateFrom) criteria.push({ fieldName: "date", operator: ">=", value: `${dateFrom}T00:00:00Z` });
        if (dateTo) criteria.push({ fieldName: "date", operator: "<=", value: `${dateTo}T23:59:59Z` });
        if (category) criteria.push({ fieldName: "categorySelect", operator: "=", value: categoryMap[category] });
        if (origin) criteria.push({ fieldName: "origin", operator: "like", value: `%${origin}%` });
        if (exception) criteria.push({ fieldName: "exception", operator: "like", value: `%${exception}%` });
        if (userName) criteria.push({ fieldName: "internalUser.name", operator: "like", value: `%${userName}%` });

        const { data, total } = await axelorSearch(CLASSES.traceBack, TRACEBACK_FIELDS, criteria, {
            limit,
            offset,
            sortBy: ["-date"],
        });

        if (data.length === 0) return text("Aucune anomalie trouvée.");

        const categoryLabel: Record<number, string> = { 1: "Non bloquant", 2: "Bloquant", 3: "Fonctionnel" };
        const rows = (data as Record<string, unknown>[]).map((t) => {
            const cat = typeof t.categorySelect === "number" ? (categoryLabel[t.categorySelect] ?? `#${t.categorySelect}`) : "?";
            const user = (t.internalUser as Record<string, unknown> | null)?.name ?? "—";
            const date = typeof t.date === "string" ? t.date.slice(0, 10) : "—";
            return `[${t.id}] ${date} | ${cat} | ${t.origin ?? "—"} | ${t.exception ?? "—"} | ${t.message ?? t.error ?? "—"} | user: ${user}`;
        });

        return text(
            `${data.length} anomalie(s) sur ${total} au total (triées par date desc) :\n\n` +
                rows.join("\n") +
                "\n\nUtiliser get_traceback avec l'ID pour voir la stack trace complète.",
        );
    },
);

// Packages framework à filtrer lors de l'analyse de stack trace
const FRAMEWORK_PREFIXES = [
    "java.", "javax.", "sun.", "com.sun.", "jdk.",
    "org.springframework.", "org.hibernate.", "org.jboss.",
    "io.netty.", "org.apache.", "ch.qos.", "org.slf4j.",
    "com.google.", "org.reflections.", "org.codehaus.",
    "com.zaxxer.", "org.postgresql.", "org.mariadb.",
];

function isAppFrame(frame: string): boolean {
    return FRAMEWORK_PREFIXES.every((prefix) => !frame.includes(`at ${prefix}`));
}

function parseStackTrace(trace: string): {
    exceptionChain: { type: string; message: string }[];
    appFrames: string[];
    firstAppFrame: string | null;
    allFrames: string[];
} {
    const lines = trace.split("\n").map((l) => l.trim()).filter(Boolean);
    const exceptionChain: { type: string; message: string }[] = [];
    const appFrames: string[] = [];
    const allFrames: string[] = [];

    for (const line of lines) {
        if (line.startsWith("at ")) {
            allFrames.push(line);
            if (isAppFrame(line)) appFrames.push(line);
        } else if (line.startsWith("Caused by:") || (!line.startsWith("...") && !line.startsWith("at "))) {
            const raw = line.replace(/^Caused by:\s*/, "");
            const colonIdx = raw.indexOf(":");
            if (colonIdx !== -1) {
                exceptionChain.push({ type: raw.slice(0, colonIdx).trim(), message: raw.slice(colonIdx + 1).trim() });
            } else {
                exceptionChain.push({ type: raw.trim(), message: "" });
            }
        }
    }

    return {
        exceptionChain,
        appFrames,
        firstAppFrame: appFrames[0] ?? null,
        allFrames,
    };
}

server.registerTool(
    "get_traceback",
    {
        description:
            "Analyse technique complète d'une anomalie Axelor : chaîne d'exceptions, frames applicatifs isolés (sans le bruit framework), premier point d'entrée probable du bug, stack trace complète.",
        inputSchema: {
            id: z.number().describe("ID de l'anomalie (retourné par search_tracebacks)"),
            showFullTrace: z
                .boolean()
                .optional()
                .describe("Inclure la stack trace brute complète en plus de l'analyse (défaut : false)"),
        },
    },
    async ({ id, showFullTrace = false }) => {
        const item = (await axelorGetById(CLASSES.traceBack, id)) as Record<string, unknown> | null;
        if (!item) return text(`Aucune anomalie trouvée pour l'ID ${id}.`);

        const categoryLabel: Record<number, string> = { 1: "Non bloquant", 2: "Bloquant", 3: "Fonctionnel" };
        const cat = typeof item.categorySelect === "number" ? (categoryLabel[item.categorySelect] ?? `#${item.categorySelect}`) : "?";
        const user = (item.internalUser as Record<string, unknown> | null)?.name ?? "—";

        const lines: string[] = [
            `══ TraceBack #${item.id} ═══════════════════════════════════════`,
            `Date       : ${item.date ?? "—"}`,
            `Catégorie  : ${cat}`,
            `Origine    : ${item.origin ?? "—"}`,
            `Référence  : ${item.ref ?? "—"} (refId: ${item.refId ?? "—"})`,
            `Utilisateur: ${user}`,
            ``,
            `── Contexte ─────────────────────────────────────────────────────`,
            `Exception  : ${item.exception ?? "—"}`,
            `Message    : ${item.message ?? "—"}`,
            `Erreur     : ${item.error ?? "—"}`,
            `Cause      : ${item.cause ?? "—"}`,
        ];

        const rawTrace = item.trace ? String(item.trace) : null;

        if (rawTrace) {
            const { exceptionChain, appFrames, firstAppFrame, allFrames } = parseStackTrace(rawTrace);

            lines.push(``, `── Analyse technique ────────────────────────────────────────────`);

            if (exceptionChain.length > 0) {
                lines.push(`Chaîne d'exceptions (${exceptionChain.length}) :`);
                exceptionChain.forEach((ex, i) => {
                    const indent = i === 0 ? "  └─ [racine]" : `  └─ [cause ${i}]`;
                    lines.push(`${indent} ${ex.type}`);
                    if (ex.message) lines.push(`           msg: ${ex.message.slice(0, 200)}`);
                });
            }

            lines.push(``);
            if (firstAppFrame) {
                lines.push(`Point d'entrée probable du bug :`);
                lines.push(`  >>> ${firstAppFrame}`);
            } else {
                lines.push(`Point d'entrée : aucun frame applicatif identifié (erreur purement framework ?)`);
            }

            lines.push(``);
            lines.push(`Frames applicatifs (hors framework — ${appFrames.length}/${allFrames.length} total) :`);
            if (appFrames.length === 0) {
                lines.push(`  (aucun — tous les frames sont des librairies tierces)`);
            } else {
                appFrames.slice(0, 15).forEach((f) => lines.push(`  ${f}`));
                if (appFrames.length > 15) lines.push(`  ... (${appFrames.length - 15} frames app supplémentaires)`);
            }

            if (showFullTrace) {
                lines.push(``, `── Stack trace brute complète ───────────────────────────────────`);
                lines.push(rawTrace);
            }
        } else {
            lines.push(``, `(aucune stack trace disponible)`);
        }

        return text(lines.join("\n"));
    },
);

server.registerTool(
    "analyze_tracebacks",
    {
        description:
            "Analyse agrégée des anomalies Axelor : top exceptions par fréquence, répartition par origine/module, tendance par jour. Utile pour identifier les erreurs récurrentes et les régressions.",
        inputSchema: {
            dateFrom: z.string().optional().describe("Date minimale (YYYY-MM-DD)"),
            dateTo: z.string().optional().describe("Date maximale (YYYY-MM-DD)"),
            category: z
                .enum(["non_bloquant", "bloquant", "fonctionnel"])
                .optional()
                .describe("Catégorie : non_bloquant=1, bloquant=2, fonctionnel=3"),
            origin: z.string().optional().describe("Filtrer sur une origine (partielle)"),
            topN: z.number().optional().describe("Nombre d'entrées dans chaque top (défaut : 10)"),
        },
    },
    async ({ dateFrom, dateTo, category, origin, topN = 10 }) => {
        const categoryMap = { non_bloquant: 1, bloquant: 2, fonctionnel: 3 };
        const criteria: Criterion[] = [{ fieldName: "archived", operator: "=", value: false }];

        if (dateFrom) criteria.push({ fieldName: "date", operator: ">=", value: `${dateFrom}T00:00:00Z` });
        if (dateTo) criteria.push({ fieldName: "date", operator: "<=", value: `${dateTo}T23:59:59Z` });
        if (category) criteria.push({ fieldName: "categorySelect", operator: "=", value: categoryMap[category] });
        if (origin) criteria.push({ fieldName: "origin", operator: "like", value: `%${origin}%` });

        const { data, total } = await axelorSearch(CLASSES.traceBack, TRACEBACK_FIELDS, criteria, {
            limit: 500,
            sortBy: ["-date"],
        });

        if (data.length === 0) return text("Aucune anomalie trouvée sur la période.");

        const items = data as Record<string, unknown>[];

        // Groupement par type d'exception (nom court)
        const byException: Record<string, { count: number; lastDate: string; sample: string }> = {};
        const byOrigin: Record<string, number> = {};
        const byDay: Record<string, { total: number; bloquant: number }> = {};
        const categoryLabel: Record<number, string> = { 1: "Non bloquant", 2: "Bloquant", 3: "Fonctionnel" };

        for (const item of items) {
            // Exception : garder le nom court (dernière partie du FQN)
            const fqn = typeof item.exception === "string" ? item.exception : "Inconnu";
            const shortName = fqn.includes(".") ? fqn.split(".").pop()! : fqn;
            const dateStr = typeof item.date === "string" ? item.date.slice(0, 10) : "inconnu";
            const msg = typeof item.message === "string" ? item.message : (typeof item.error === "string" ? item.error : "");

            if (!byException[shortName]) byException[shortName] = { count: 0, lastDate: dateStr, sample: msg.slice(0, 120) };
            byException[shortName].count++;
            if (dateStr > byException[shortName].lastDate) byException[shortName].lastDate = dateStr;

            // Origine
            const orig = typeof item.origin === "string" && item.origin ? item.origin : "(non renseigné)";
            byOrigin[orig] = (byOrigin[orig] ?? 0) + 1;

            // Tendance par jour
            if (!byDay[dateStr]) byDay[dateStr] = { total: 0, bloquant: 0 };
            byDay[dateStr].total++;
            if (item.categorySelect === 2) byDay[dateStr].bloquant++;
        }

        const topExceptions = Object.entries(byException)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, topN);

        const topOrigins = Object.entries(byOrigin)
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN);

        const sortedDays = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);

        const lines: string[] = [
            `══ Analyse anomalies ═══════════════════════════════════════════`,
            `Période   : ${dateFrom ?? "—"} → ${dateTo ?? "aujourd'hui"}`,
            `Total     : ${data.length} anomalie(s) analysée(s) sur ${total} (max 500 chargées)`,
            ``,
            `── Top ${topN} exceptions par fréquence ──────────────────────────────`,
        ];

        topExceptions.forEach(([name, stats], i) => {
            lines.push(`  ${String(i + 1).padStart(2)}. ${name.padEnd(50)} ×${stats.count}  (dernière: ${stats.lastDate})`);
            if (stats.sample) lines.push(`      ex: ${stats.sample}`);
        });

        lines.push(``, `── Top ${topN} origines / modules touchés ────────────────────────────`);
        topOrigins.forEach(([orig, count], i) => {
            lines.push(`  ${String(i + 1).padStart(2)}. ${orig.padEnd(55)} ×${count}`);
        });

        lines.push(``, `── Tendance par jour (14 derniers jours) ─────────────────────────`);
        sortedDays.forEach(([day, stats]) => {
            const bar = "█".repeat(Math.min(stats.total, 30));
            const bloquantNote = stats.bloquant > 0 ? `  ⚠ ${stats.bloquant} bloquant(s)` : "";
            lines.push(`  ${day} │ ${bar} ${stats.total}${bloquantNote}`);
        });

        return text(lines.join("\n"));
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
