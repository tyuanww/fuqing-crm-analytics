export interface paths {
    "/api/v1/metrics/crm-analyses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Save Crm Analysis */
        post: operations["save_crm_analysis_api_v1_metrics_crm_analyses_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics/crm-analyses/{asset_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Crm Analysis */
        get: operations["read_crm_analysis_api_v1_metrics_crm_analyses__asset_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics/crm-cockpit-references": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add Crm Reference */
        post: operations["add_crm_reference_api_v1_metrics_crm_cockpit_references_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics/crm-cockpit-references/{asset_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Crm Reference */
        get: operations["read_crm_reference_api_v1_metrics_crm_cockpit_references__asset_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics/crm-library": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Crm Library */
        get: operations["read_crm_library_api_v1_metrics_crm_library_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics/dashboard-purchases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Dashboard Purchases
         * @description 看板同范围购买分母及AOV/AUS；日期含首尾，最多90天。
         */
        get: operations["get_dashboard_purchases_api_v1_metrics_dashboard_purchases_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics/dashboard-snapshots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Capture Dashboard Snapshot */
        post: operations["capture_dashboard_snapshot_api_v1_metrics_dashboard_snapshots_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics/dashboard-snapshots/{asset_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Crm Snapshot */
        get: operations["read_crm_snapshot_api_v1_metrics_dashboard_snapshots__asset_id__get"];
        put?: never;
        post?: never;
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
        /** CrmAddReference */
        CrmAddReference: {
            /** Analysis Id */
            analysis_id: string;
        };
        /** CrmAnalysis */
        CrmAnalysis: {
            /** Analysis Id */
            analysis_id: string;
            /**
             * Saved At
             * Format: date-time
             */
            saved_at: string;
            /**
             * Schema Version
             * @default crm-saved-analysis/v1
             * @constant
             */
            schema_version: "crm-saved-analysis/v1";
            snapshot: components["schemas"]["CrmSnapshot"];
            /** Title */
            title: string;
        };
        /** CrmCockpitReference */
        CrmCockpitReference: {
            /**
             * Added At
             * Format: date-time
             */
            added_at: string;
            analysis: components["schemas"]["CrmAnalysis"];
            /** Reference Id */
            reference_id: string;
            /**
             * Schema Version
             * @default crm-cockpit-reference/v1
             * @constant
             */
            schema_version: "crm-cockpit-reference/v1";
        };
        /** CrmLibrary */
        CrmLibrary: {
            /** Analyses */
            analyses: components["schemas"]["CrmAnalysis"][];
            /** Analyses Truncated */
            analyses_truncated: boolean;
            /**
             * Data Kind
             * @enum {string}
             */
            data_kind: "real" | "synthetic";
            /** References */
            references: components["schemas"]["CrmCockpitReference"][];
            /** References Truncated */
            references_truncated: boolean;
            /**
             * Schema Version
             * @default crm-library/v1
             * @constant
             */
            schema_version: "crm-library/v1";
            /** Snapshots */
            snapshots: components["schemas"]["CrmSnapshot"][];
            /** Snapshots Truncated */
            snapshots_truncated: boolean;
        };
        /** CrmSaveAnalysis */
        CrmSaveAnalysis: {
            /** Snapshot Id */
            snapshot_id: string;
            /** Title */
            title: string;
        };
        /** CrmSnapshot */
        CrmSnapshot: {
            /**
             * Captured At
             * Format: date-time
             */
            captured_at: string;
            /**
             * Data Kind
             * @enum {string}
             */
            data_kind: "real" | "synthetic";
            result: components["schemas"]["DashboardPurchases"];
            /** Result Sha256 */
            result_sha256: string;
            /**
             * Schema Version
             * @default crm-result-snapshot/v1
             * @constant
             */
            schema_version: "crm-result-snapshot/v1";
            /** Snapshot Id */
            snapshot_id: string;
        };
        /** CrmSnapshotRequest */
        CrmSnapshotRequest: {
            /**
             * Channel
             * @default 全店
             * @enum {string}
             */
            channel: "全店" | "纯派样" | "货架" | "达播" | "直播" | "淘客" | "微博" | "U先派样" | "百补派样" | "赠品&0.01" | "其他";
            /**
             * End Date
             * Format: date
             */
            end_date: string;
            /**
             * Exclude Low Price
             * @default false
             */
            exclude_low_price: boolean;
            /**
             * Start Date
             * Format: date
             */
            start_date: string;
        };
        /** DashboardAverage */
        DashboardAverage: {
            /** Amount Fen */
            amount_fen: number | null;
            /** Denominator */
            denominator: number;
            /** Reason */
            reason: ("NO_PURCHASES" | "UNKNOWN_ORDER" | "UNKNOWN_BUYER" | "INVALID_AMOUNT") | null;
        };
        /** DashboardCoverage */
        DashboardCoverage: {
            /** Buyers */
            buyers: number;
            /** Negative Amount Rows */
            negative_amount_rows: number;
            /** Null Amount Rows */
            null_amount_rows: number;
            /** Orders */
            orders: number;
            /** Rows */
            rows: number;
            /** Unknown Buyer Amount Fen */
            unknown_buyer_amount_fen: number;
            /** Unknown Buyer Rows */
            unknown_buyer_rows: number;
            /** Unknown Order Amount Fen */
            unknown_order_amount_fen: number;
            /** Unknown Order Rows */
            unknown_order_rows: number;
            /** Zero Amount Orders */
            zero_amount_orders: number;
            /** Zero Only Buyers */
            zero_only_buyers: number;
        };
        /** DashboardFilters */
        DashboardFilters: {
            /**
             * Channel
             * @default 全店
             * @enum {string}
             */
            channel: "全店" | "纯派样" | "货架" | "达播" | "直播" | "淘客" | "微博" | "U先派样" | "百补派样" | "赠品&0.01" | "其他";
            /**
             * End Date
             * Format: date
             */
            end_date: string;
            /**
             * Exclude Low Price
             * @default false
             */
            exclude_low_price: boolean;
            /**
             * Start Date
             * Format: date
             */
            start_date: string;
        };
        /** DashboardPurchases */
        DashboardPurchases: {
            aov: components["schemas"]["DashboardAverage"];
            aus: components["schemas"]["DashboardAverage"];
            coverage: components["schemas"]["DashboardCoverage"];
            /** Data Through */
            data_through?: null;
            filters: components["schemas"]["DashboardFilters"];
            /** Gsv Amount Fen */
            gsv_amount_fen: number;
            /** Limitations */
            limitations: string[];
            /**
             * Metric Version
             * @default dashboard-gsv-purchases/v1
             * @constant
             */
            metric_version: "dashboard-gsv-purchases/v1";
            /** Refund As Of */
            refund_as_of?: null;
            /**
             * Schema Version
             * @default crm-dashboard-purchases/v1
             * @constant
             */
            schema_version: "crm-dashboard-purchases/v1";
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
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
    save_crm_analysis_api_v1_metrics_crm_analyses_post: {
        parameters: {
            query?: never;
            header?: {
                "idempotency-key"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrmSaveAnalysis"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrmAnalysis"];
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
    read_crm_analysis_api_v1_metrics_crm_analyses__asset_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                asset_id: string;
            };
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
                    "application/json": components["schemas"]["CrmAnalysis"];
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
    add_crm_reference_api_v1_metrics_crm_cockpit_references_post: {
        parameters: {
            query?: never;
            header?: {
                "idempotency-key"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrmAddReference"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrmCockpitReference"];
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
    read_crm_reference_api_v1_metrics_crm_cockpit_references__asset_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                asset_id: string;
            };
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
                    "application/json": components["schemas"]["CrmCockpitReference"];
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
    read_crm_library_api_v1_metrics_crm_library_get: {
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
                    "application/json": components["schemas"]["CrmLibrary"];
                };
            };
        };
    };
    get_dashboard_purchases_api_v1_metrics_dashboard_purchases_get: {
        parameters: {
            query: {
                channel?: "全店" | "纯派样" | "货架" | "达播" | "直播" | "淘客" | "微博" | "U先派样" | "百补派样" | "赠品&0.01" | "其他";
                end_date: string;
                exclude_low_price?: boolean;
                start_date: string;
            };
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
                    "application/json": components["schemas"]["DashboardPurchases"];
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
    capture_dashboard_snapshot_api_v1_metrics_dashboard_snapshots_post: {
        parameters: {
            query?: never;
            header?: {
                "idempotency-key"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrmSnapshotRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrmSnapshot"];
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
    read_crm_snapshot_api_v1_metrics_dashboard_snapshots__asset_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                asset_id: string;
            };
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
                    "application/json": components["schemas"]["CrmSnapshot"];
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
