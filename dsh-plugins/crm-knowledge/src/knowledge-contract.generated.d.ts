export interface paths {
    "/api/v1/crm-knowledge/capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Capabilities */
        get: operations["capabilities_api_v1_crm_knowledge_capabilities_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/crm-knowledge/explain": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Explain */
        post: operations["explain_api_v1_crm_knowledge_explain_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** KnowledgeExplainRequest */
        KnowledgeExplainRequest: {
            /** Topic */
            topic: string;
        };
        /** KnowledgeExplanation */
        KnowledgeExplanation: {
            /**
             * Code Fixed In Legacy Services
             * @constant
             */
            code_fixed_in_legacy_services: false;
            /**
             * Content Scope
             * @constant
             */
            content_scope: "public_synthetic_pack_only";
            /** Context Nodes */
            context_nodes: {
                [key: string]: unknown;
            }[];
            /** Decision Ids */
            decision_ids: string[];
            /**
             * Document Acl Connected
             * @constant
             */
            document_acl_connected: false;
            /**
             * Dsh Using Neo4J
             * @constant
             */
            dsh_using_neo4j: false;
            /** Evidence Refs */
            evidence_refs: string[];
            /**
             * Execution Authorized
             * @constant
             */
            execution_authorized: false;
            /** Implementation Status */
            implementation_status: string;
            /**
             * Metric Version
             * @constant
             */
            metric_version: "crm-metrics/v1";
            /** Pack Sha256 */
            pack_sha256: string;
            /**
             * Pack Version
             * @constant
             */
            pack_version: "crm-knowledge-offline/v1";
            /**
             * Publication Status
             * @constant
             */
            publication_status: "local_isolated_candidate";
            /**
             * Real Business Acceptance
             * @constant
             */
            real_business_acceptance: false;
            /** Relations */
            relations: {
                [key: string]: unknown;
            }[];
            /** Sources */
            sources: {
                [key: string]: unknown;
            }[];
            /**
             * Synthetic
             * @constant
             */
            synthetic: true;
            /** Topic */
            topic: string;
        } & {
            [key: string]: unknown;
        };
        /**
         * ServiceError
         * @description Sanitized wire errors shared by the two public synthetic transports.
         */
        ServiceError: {
            /** Code */
            code: string;
            /** Message */
            message?: string | null;
            /**
             * Status
             * @constant
             */
            status: "UNAVAILABLE";
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    capabilities_api_v1_crm_knowledge_capabilities_get: {
        parameters: {
            query?: never;
            header: {
                /** @description Exact public synthetic service API identity; not an authentication credential. */
                "X-ShineMage-Contract": "crm-knowledge-service/1.0.0";
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Browser Origin rejected */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceError"];
                };
            };
            /** @description Service API identity mismatch */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceError"];
                };
            };
            /** @description Invalid request; input details are not echoed */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceError"];
                };
            };
        };
    };
    explain_api_v1_crm_knowledge_explain_post: {
        parameters: {
            query?: never;
            header: {
                /** @description Exact public synthetic service API identity; not an authentication credential. */
                "X-ShineMage-Contract": "crm-knowledge-service/1.0.0";
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["KnowledgeExplainRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KnowledgeExplanation"];
                };
            };
            /** @description Browser Origin rejected */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceError"];
                };
            };
            /** @description Service API identity mismatch */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceError"];
                };
            };
            /** @description Invalid request; input details are not echoed */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceError"];
                };
            };
        };
    };
}
