import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CLASSES, PARTNER_FIELDS, PRODUCT_FIELDS, SALE_ORDER_FIELDS } from "./fields.ts";

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
    options: { limit?: number; sortBy?: string[] } = {},
): Promise<{ data: unknown[]; total: number }> {
    const res = await axelorFetch(`/ws/rest/${className}/search`, {
        method: "POST",
        body: JSON.stringify({
            offset: 0,
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
            "Rechercher des commandes clients (SaleOrder) dans Axelor. Filtres possibles : client, numéro de commande, statut, état facturation, état livraison.",
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
        },
    },
    async ({ clientName, orderSeq, externalReference, statusSelect, invoicingState, deliveryState }) => {
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

        if (criteria.length === 0) criteria.push({ fieldName: "id", operator: "notNull", value: null });

        const { data, total } = await axelorSearch(CLASSES.saleOrder, SALE_ORDER_FIELDS, criteria, {
            sortBy: ["-orderDate"],
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

// ── Démarrage ─────────────────────────────────────────────────────────────────

async function main() {
    sessionCookie = await getSessionCookie();
    console.error("Connecté à Axelor.");
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);
