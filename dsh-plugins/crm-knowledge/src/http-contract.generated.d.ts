export interface paths {
    "/api/v1/crm-metrics/capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Capabilities */
        get: operations["capabilities_api_v1_crm_metrics_capabilities_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/crm-metrics/explain": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Explain */
        post: operations["explain_api_v1_crm_metrics_explain_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/crm-metrics/query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Query */
        post: operations["query_api_v1_crm_metrics_query_post"];
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
        /** ExplainRequest */
        ExplainRequest: {
            /**
             * Metric Version
             * @default crm-metrics/v1
             * @constant
             */
            metric_version: "crm-metrics/v1";
            /** Topic */
            topic: string;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** Limitation */
        Limitation: {
            /** Code */
            code: string;
            /** Message */
            message: string;
            /** Related Fact */
            related_fact?: string | null;
        };
        /** MetricRequest */
        MetricRequest: {
            /**
             * Actor Scope
             * @default server_filled
             */
            actor_scope: string;
            /**
             * Amount Already Net
             * @default false
             */
            amount_already_net: boolean;
            /** Channel Ids */
            channel_ids?: string[] | null;
            /** Cohort Period End Exclusive */
            cohort_period_end_exclusive?: string | null;
            /** Cohort Period Start */
            cohort_period_start?: string | null;
            /** Contains Real Data */
            contains_real_data: boolean;
            /** Data Through */
            data_through: string;
            /**
             * Identity Scope
             * @default STOREWIDE
             * @constant
             */
            identity_scope: "STOREWIDE";
            /**
             * Metric Version
             * @constant
             */
            metric_version: "crm-metrics/v1";
            /** Observation Days */
            observation_days?: number | null;
            /** Period End Exclusive */
            period_end_exclusive: string;
            /** Period Start */
            period_start: string;
            /** Product Ids */
            product_ids?: string[] | null;
            /**
             * Query Id
             * @enum {string}
             */
            query_id: "sales_window_summary" | "existing_customer_repurchase" | "sample_followup";
            /** Refund As Of */
            refund_as_of: string;
            /**
             * Refund View
             * @enum {string}
             */
            refund_view: "ORDER_COHORT_AS_OF" | "REFUND_FLOW";
            /** Source Id */
            source_id: string;
            /**
             * Timezone
             * @default Asia/Shanghai
             * @constant
             */
            timezone: "Asia/Shanghai";
        };
        /** MetricResult */
        MetricResult: {
            /** Actor Scope */
            actor_scope?: string | null;
            /** Adapter Query Ref */
            adapter_query_ref?: string | null;
            /** Adapter Version */
            adapter_version?: string | null;
            /** Contains Real Data */
            contains_real_data: boolean;
            /** Coverage Start */
            coverage_start?: string | null;
            /** Data Through */
            data_through: string;
            /** Data Version */
            data_version: string;
            /** Decision Ids */
            decision_ids: string[];
            /** Facts */
            facts: {
                [key: string]: unknown;
            };
            /** History Complete */
            history_complete?: boolean | null;
            /**
             * Implementation Status
             * @enum {string}
             */
            implementation_status: "synthetic_verified" | "not_implemented" | "source_unverified";
            /** Limitations */
            limitations: components["schemas"]["Limitation"][];
            /** Mapping Version */
            mapping_version: string;
            /** Metric Id */
            metric_id: string;
            /**
             * Metric Version
             * @constant
             */
            metric_version: "crm-metrics/v1";
            /** Permission Version */
            permission_version?: string | null;
            /**
             * Production Release
             * @default false
             */
            production_release: boolean;
            /**
             * Publication Status
             * @default local_isolated_candidate
             * @constant
             */
            publication_status: "local_isolated_candidate";
            /** Query Id */
            query_id: string;
            /** Query Ref */
            query_ref: string;
            /**
             * Query Version
             * @default crm-metrics-query/v1
             * @constant
             */
            query_version: "crm-metrics-query/v1";
            /**
             * Real Business Acceptance
             * @default false
             */
            real_business_acceptance: boolean;
            resolved_filters: components["schemas"]["ResolvedFilters"];
            /**
             * Schema Version
             * @default crm-metrics-wire/v1
             * @constant
             */
            schema_version: "crm-metrics-wire/v1";
            /** Source Data Through */
            source_data_through?: string | null;
            /** Source Id */
            source_id: string;
            /**
             * Status
             * @enum {string}
             */
            status: "OK" | "UNAVAILABLE";
            /** Synthetic */
            synthetic: boolean;
        };
        /** ResolvedFilters */
        ResolvedFilters: {
            /** Amount Already Net */
            amount_already_net: boolean;
            /** Channel Ids */
            channel_ids: string[] | null;
            /** Cohort Period End Exclusive */
            cohort_period_end_exclusive?: string | null;
            /** Cohort Period Start */
            cohort_period_start?: string | null;
            /** Data Through */
            data_through: string;
            /** Identity Scope */
            identity_scope: string;
            /** Observation Days */
            observation_days?: number | null;
            /** Period End Exclusive */
            period_end_exclusive: string;
            /** Period Start */
            period_start: string;
            /** Product Ids */
            product_ids: string[] | null;
            /** Refund As Of */
            refund_as_of: string;
            /** Refund View */
            refund_view: string;
            /** Timezone */
            timezone: string;
            /** Yoy Period End Exclusive */
            yoy_period_end_exclusive?: string | null;
            /** Yoy Period Start */
            yoy_period_start?: string | null;
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
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
    capabilities_api_v1_crm_metrics_capabilities_get: {
        parameters: {
            query?: never;
            header?: never;
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
        };
    };
    explain_api_v1_crm_metrics_explain_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExplainRequest"];
            };
        };
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
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    query_api_v1_crm_metrics_query_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MetricRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MetricResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
}
