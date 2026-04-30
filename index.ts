import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.AXELOR_BASE_URL;
let sessionCookie = "";

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
        console.error("🔄 Session expirée, re-authentification...");
        sessionCookie = await getSessionCookie();
        return fetch(`${BASE_URL}${path}`, {
            ...options,
            headers: { "Content-Type": "application/json", Cookie: sessionCookie, ...options.headers },
        });
    }
    return res;
}

const PARTNER_CLASS = "com.axelor.apps.base.db.Partner";

// Champs scalaires utiles du modèle Partner
const PARTNER_FIELDS = [
    "id",
    "partnerSeq",
    "name",
    "firstName",
    "fullName",
    "simpleFullName",
    "fixedPhone",
    "mobilePhone",
    "taxNbr",
    "siren",
    "registrationCode",
    "webSite",
    "description",
    "jobTitle",
    "department",
    "isCustomer",
    "isSupplier",
    "isProspect",
    "isContact",
    "isEmployee",
    "isCompensation",
    "isInternal",
    "isCorporatePartner",
    "partnerTypeSelect",
    "titleSelect",
    "sizeSelect",
    "leadScoringSelect",
    "saleTurnover",
    "paymentDelay",
    "deliveryDelay",
    "headOfficeAddress",
    "importOrigin",
    "createdOn",
    "updatedOn",
];

const server = new McpServer({ name: "axelor-mcp-session", version: "1.0.0" });

// ── Recherche de partenaires ──────────────────────────────────────────────────
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
        const criteria: object[] = [{ fieldName: "name", operator: "like", value: `%${query}%` }];
        if (type === "customer") criteria.push({ fieldName: "isCustomer", operator: "=", value: true });
        if (type === "supplier") criteria.push({ fieldName: "isSupplier", operator: "=", value: true });
        if (type === "prospect") criteria.push({ fieldName: "isProspect", operator: "=", value: true });
        if (type === "contact") criteria.push({ fieldName: "isContact", operator: "=", value: true });

        const res = await axelorFetch(`/ws/rest/${PARTNER_CLASS}/search`, {
            method: "POST",
            body: JSON.stringify({
                offset: 0,
                limit: 20,
                fields: PARTNER_FIELDS,
                data: { criteria, operator: "and" },
            }),
        });
        if (!res.ok) throw new Error(`Axelor search failed: ${res.status}`);
        const json = (await res.json()) as { data?: unknown[]; total?: number };
        const partners = json.data ?? [];
        return {
            content: [
                {
                    type: "text" as const,
                    text:
                        partners.length === 0
                            ? "Aucun partenaire trouvé."
                            : `${partners.length} résultat(s) (total: ${json.total ?? "?"}):\n\n${JSON.stringify(partners, null, 2)}`,
                },
            ],
        };
    },
);

// ── Détails d'un partenaire par ID ────────────────────────────────────────────
server.registerTool(
    "get_partner",
    {
        description: "Obtenir tous les détails d'un partenaire Axelor par son ID",
        inputSchema: {
            id: z.number().describe("ID du partenaire (champ 'id' retourné par search_partners)"),
        },
    },
    async ({ id }) => {
        const res = await axelorFetch(`/ws/rest/${PARTNER_CLASS}/${id}`, {
            method: "GET",
        });
        if (res.status === 404)
            return { content: [{ type: "text" as const, text: `Partenaire ID ${id} introuvable.` }] };
        if (!res.ok) throw new Error(`Axelor get failed: ${res.status}`);
        const json = (await res.json()) as { data?: unknown[] };
        const partner = json.data?.[0] ?? null;
        return {
            content: [
                {
                    type: "text" as const,
                    text: partner ? JSON.stringify(partner, null, 2) : `Partenaire ID ${id} introuvable.`,
                },
            ],
        };
    },
);

async function main() {
    sessionCookie = await getSessionCookie();
    console.error("✅ Connecté à Axelor.");
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);
