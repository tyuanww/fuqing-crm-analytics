/** Generated first-purchase saved-analysis HTTP contract; do not edit. OpenAPI SHA-256: 6209894f434fa0cadb746b46400064dbcec6eee8a80279423f2d1b8db52725ee */
export interface paths {
    "/api/v1/analytics-first-purchase/analyses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Analyses */
        get: operations["analytics_first_purchase_analysis_list"];
        put?: never;
        /** Create Analysis */
        post: operations["analytics_first_purchase_analysis_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics-first-purchase/analyses/{analysis_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Analysis */
        get: operations["analytics_first_purchase_analysis_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics-first-purchase/analyses/{analysis_id}/provenance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Saved Provenance */
        get: operations["analytics_first_purchase_saved_provenance_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics-first-purchase/analyses/{analysis_id}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Publish Title */
        post: operations["analytics_first_purchase_analysis_publish_title"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics-first-purchase/save-receipts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Save Result */
        post: operations["analytics_first_purchase_save_receipt_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics-first-purchase/save-receipts/reconcile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reconcile Save Receipt */
        post: operations["analytics_first_purchase_save_receipt_reconcile"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics-first-purchase/save-results/inspect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Inspect Save Result */
        post: operations["analytics_first_purchase_save_result_inspect"];
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
        /** AnalyticsErrorDetail */
        AnalyticsErrorDetail: {
            /** Code */
            code: string;
            /** Message */
            message: string;
            /** Recovery Url */
            recovery_url?: string | null;
            /** Request Id */
            request_id: string;
            /** Retryable */
            retryable: boolean;
        };
        /** AnalyticsErrorResponse */
        AnalyticsErrorResponse: {
            error: components["schemas"]["AnalyticsErrorDetail"];
        };
        /** FirstPurchaseAnalysisCreateRequest */
        FirstPurchaseAnalysisCreateRequest: {
            /** Created From Run Id */
            created_from_run_id: string;
            /** Title */
            title: string;
            visual_spec?: components["schemas"]["FirstPurchaseVisualSpec"] | null;
        };
        /** FirstPurchaseAnalysisRef */
        FirstPurchaseAnalysisRef: {
            /** Analysis Id */
            analysis_id: string;
            /** Version */
            version: number;
        };
        /** FirstPurchaseAnalysisTitleRequest */
        FirstPurchaseAnalysisTitleRequest: {
            /** Title */
            title: string;
        };
        /** FirstPurchaseFacts */
        FirstPurchaseFacts: {
            /**
             * Amount Precision
             * @default integer_fen
             * @constant
             */
            amount_precision: "integer_fen";
            /**
             * Amount Unit
             * @default minor
             * @constant
             */
            amount_unit: "minor";
            /** Cohort Enrolled Count */
            cohort_enrolled_count: number;
            /** Cohort Immature Count */
            cohort_immature_count: number;
            /** Cohort Mature Count */
            cohort_mature_count: number;
            /**
             * Currency
             * @default CNY
             * @constant
             */
            currency: "CNY";
            /**
             * Display Name
             * @default 首购商品路径 / N日正装转化
             * @constant
             */
            display_name: "首购商品路径 / N日正装转化";
            /**
             * Observation Days
             * @enum {integer}
             */
            observation_days: 30 | 60 | 90;
            /** Products */
            products: components["schemas"]["FirstPurchaseProductRow"][];
        };
        /** FirstPurchaseFixedWindow */
        FirstPurchaseFixedWindow: {
            /**
             * End Date
             * Format: date
             */
            end_date: string;
            /**
             * Kind
             * @constant
             */
            kind: "FIXED";
            /**
             * Start Date
             * Format: date
             */
            start_date: string;
        };
        /**
         * FirstPurchaseFreshness
         * @description NOT_CHECKED records an explicit server policy, never a fresh-time claim.
         */
        FirstPurchaseFreshness: {
            /** Expires After Ms */
            expires_after_ms: number | null;
            /**
             * Freshness Checked At
             * Format: date-time
             */
            freshness_checked_at: string;
            /** Freshness Expires At */
            freshness_expires_at: string | null;
            /** Freshness Stale At */
            freshness_stale_at: string | null;
            /**
             * Freshness State
             * @enum {string}
             */
            freshness_state: "FRESH" | "STALE" | "EXPIRED" | "UNKNOWN" | "NOT_CHECKED";
            /** Max Age Ms */
            max_age_ms: number | null;
            /** Policy Version */
            policy_version: string | null;
            /**
             * Reason
             * @enum {string}
             */
            reason: "WITHIN_WINDOW" | "MAX_AGE_REACHED" | "EXPIRED" | "POLICY_NOT_CONFIGURED" | "GENERATION_TIME_UNAVAILABLE" | "CLOCK_BEFORE_GENERATION" | "DISABLED_BY_POLICY";
        };
        /** FirstPurchaseMetricRef */
        FirstPurchaseMetricRef: {
            /**
             * Metric Id
             * @default first_purchase_product_n_day_finished
             * @constant
             */
            metric_id: "first_purchase_product_n_day_finished";
            /**
             * Metric Version
             * @default first-purchase-path-metric/v1
             * @constant
             */
            metric_version: "first-purchase-path-metric/v1";
        };
        /** FirstPurchasePermissionScope */
        FirstPurchasePermissionScope: {
            /** Can Read */
            can_read: boolean;
            /** Can Save */
            can_save: boolean;
            /**
             * Data Scope
             * @default first-purchase-fixture
             * @constant
             */
            data_scope: "first-purchase-fixture";
            /** Owner Id */
            owner_id: string;
        };
        /** FirstPurchaseProductRow */
        FirstPurchaseProductRow: {
            /** Empty Reason */
            empty_reason?: "EMPTY_MATURE_COHORT" | null;
            /** Enrolled Count */
            enrolled_count: number;
            /** Finished Conversion Count */
            finished_conversion_count: number;
            /** Finished Conversion Ratio */
            finished_conversion_ratio?: number | null;
            /** Immature Count */
            immature_count: number;
            /** Mature Count */
            mature_count: number;
            /** Product Id */
            product_id: string;
            /**
             * Role
             * @enum {string}
             */
            role: "sample" | "finished";
        };
        /** FirstPurchaseProvenanceSourceRefs */
        FirstPurchaseProvenanceSourceRefs: {
            /** Created From Run Id */
            created_from_run_id: string;
            /**
             * Data Scope
             * @default first-purchase-fixture
             * @constant
             */
            data_scope: "first-purchase-fixture";
            /** Evidence Digest */
            evidence_digest: string;
            /** Method Package Digest */
            method_package_digest: string | null;
            /** Primary Result Ref */
            primary_result_ref: string | null;
            /**
             * Service Owner
             * @default analytics-first-purchase
             * @constant
             */
            service_owner: "analytics-first-purchase";
        };
        /** FirstPurchaseQueryRef */
        FirstPurchaseQueryRef: {
            /**
             * Query Id
             * @default first_purchase_product_path
             * @constant
             */
            query_id: "first_purchase_product_path";
            /**
             * Query Version
             * @default first-purchase-path-query/v1
             * @constant
             */
            query_version: "first-purchase-path-query/v1";
        };
        /** FirstPurchaseQueryRequest */
        FirstPurchaseQueryRequest: {
            /** Channel Ids */
            channel_ids?: ("A" | "B")[];
            /** Cohort Ref */
            cohort_ref?: null;
            cohort_window: components["schemas"]["FirstPurchaseFixedWindow"];
            /** Comparison */
            comparison?: null;
            /**
             * Data Snapshot Ref
             * @default synthetic-first-purchase-v1
             * @constant
             */
            data_snapshot_ref: "synthetic-first-purchase-v1";
            /**
             * Exclude Low Price
             * @default false
             * @constant
             */
            exclude_low_price: false;
            /**
             * Metric Id
             * @default first_purchase_product_n_day_finished
             * @constant
             */
            metric_id: "first_purchase_product_n_day_finished";
            /**
             * Metric Version
             * @default first-purchase-path-metric/v1
             * @constant
             */
            metric_version: "first-purchase-path-metric/v1";
            /**
             * Observation Days
             * @enum {integer}
             */
            observation_days: 30 | 60 | 90;
            /** Product Ids */
            product_ids?: string[];
            /**
             * Query Id
             * @default first_purchase_product_path
             * @constant
             */
            query_id: "first_purchase_product_path";
            /**
             * Query Version
             * @default first-purchase-path-query/v1
             * @constant
             */
            query_version: "first-purchase-path-query/v1";
            /**
             * Schema Version
             * @default analytics-first-purchase-path/v1
             * @constant
             */
            schema_version: "analytics-first-purchase-path/v1";
            /**
             * Timezone
             * @default Asia/Shanghai
             * @constant
             */
            timezone: "Asia/Shanghai";
        };
        /** FirstPurchaseResolvedFilters */
        FirstPurchaseResolvedFilters: {
            /** As Of */
            as_of: string;
            /** Channel Ids */
            channel_ids: ("A" | "B")[];
            /** Cohort Ref */
            cohort_ref?: null;
            /**
             * Cohort Window Kind
             * @default FIXED
             * @constant
             */
            cohort_window_kind: "FIXED";
            /** Comparison */
            comparison?: null;
            /** Data Digest */
            data_digest: string;
            /**
             * Data Snapshot Ref
             * @default synthetic-first-purchase-v1
             * @constant
             */
            data_snapshot_ref: "synthetic-first-purchase-v1";
            /**
             * Data Version
             * @default synthetic-first-purchase-data/v1
             * @constant
             */
            data_version: "synthetic-first-purchase-data/v1";
            /**
             * Exclude Low Price
             * @default false
             * @constant
             */
            exclude_low_price: false;
            /** Filter Hash */
            filter_hash: string;
            /**
             * Hash Version
             * @default first-purchase-path-filter-hash/v1
             * @constant
             */
            hash_version: "first-purchase-path-filter-hash/v1";
            /**
             * Metric Id
             * @default first_purchase_product_n_day_finished
             * @constant
             */
            metric_id: "first_purchase_product_n_day_finished";
            /**
             * Metric Version
             * @default first-purchase-path-metric/v1
             * @constant
             */
            metric_version: "first-purchase-path-metric/v1";
            /**
             * Observation Days
             * @enum {integer}
             */
            observation_days: 30 | 60 | 90;
            /** Permission Scope */
            permission_scope: string;
            /** Product Ids */
            product_ids?: string[];
            /**
             * Query Id
             * @default first_purchase_product_path
             * @constant
             */
            query_id: "first_purchase_product_path";
            /**
             * Query Version
             * @default first-purchase-path-query/v1
             * @constant
             */
            query_version: "first-purchase-path-query/v1";
            /** Resolved Cohort End */
            resolved_cohort_end: string;
            /** Resolved Cohort Start */
            resolved_cohort_start: string;
            /**
             * Schema Version
             * @default analytics-first-purchase-path/v1
             * @constant
             */
            schema_version: "analytics-first-purchase-path/v1";
            /**
             * Timezone
             * @default Asia/Shanghai
             * @constant
             */
            timezone: "Asia/Shanghai";
        };
        /** FirstPurchaseResult */
        FirstPurchaseResult: {
            /**
             * Answer Mode
             * @default DETERMINISTIC_TOOL
             * @constant
             */
            answer_mode: "DETERMINISTIC_TOOL";
            /** As Of */
            as_of: string;
            /**
             * Contains Real Data
             * @default false
             * @constant
             */
            contains_real_data: false;
            /**
             * Data Snapshot Ref
             * @default synthetic-first-purchase-v1
             * @constant
             */
            data_snapshot_ref: "synthetic-first-purchase-v1";
            /**
             * Data Source
             * @default SYNTHETIC_SNAPSHOT
             * @constant
             */
            data_source: "SYNTHETIC_SNAPSHOT";
            /**
             * Data Version
             * @default synthetic-first-purchase-data/v1
             * @constant
             */
            data_version: "synthetic-first-purchase-data/v1";
            facts?: components["schemas"]["FirstPurchaseFacts"] | null;
            /** Filter Hash */
            filter_hash: string;
            /**
             * Hash Version
             * @default first-purchase-path-filter-hash/v1
             * @constant
             */
            hash_version: "first-purchase-path-filter-hash/v1";
            /** Limitations */
            limitations: string[];
            /**
             * Metric Id
             * @default first_purchase_product_n_day_finished
             * @constant
             */
            metric_id: "first_purchase_product_n_day_finished";
            /**
             * Metric Version
             * @default first-purchase-path-metric/v1
             * @constant
             */
            metric_version: "first-purchase-path-metric/v1";
            /** Missing Product Ids */
            missing_product_ids?: string[];
            /**
             * Query Id
             * @default first_purchase_product_path
             * @constant
             */
            query_id: "first_purchase_product_path";
            /**
             * Query Version
             * @default first-purchase-path-query/v1
             * @constant
             */
            query_version: "first-purchase-path-query/v1";
            /** Reason Code */
            reason_code?: "MISSING_PRODUCT_ROLE" | null;
            resolved_filters: components["schemas"]["FirstPurchaseResolvedFilters"];
            /**
             * Schema Version
             * @default analytics-first-purchase-path/v1
             * @constant
             */
            schema_version: "analytics-first-purchase-path/v1";
            /**
             * Status
             * @enum {string}
             */
            status: "OK" | "REJECTED";
        };
        /** FirstPurchaseSaveCommand */
        FirstPurchaseSaveCommand: {
            /** Created From Run Id */
            created_from_run_id: string;
            /** Evidence Digest */
            evidence_digest: string;
            identity: components["schemas"]["FirstPurchaseSaveIdentity"];
            /**
             * Schema Version
             * @constant
             */
            schema_version: "analytics-first-purchase-save-command/v1";
            /** Title */
            title: string;
            visual_spec?: components["schemas"]["FirstPurchaseVisualSpec"] | null;
        };
        /** FirstPurchaseSavedAnalysis */
        FirstPurchaseSavedAnalysis: {
            /** Analysis Id */
            analysis_id: string;
            /** Created At */
            created_at: string;
            /** Created From Run Id */
            created_from_run_id: string;
            /**
             * Data Mode
             * @constant
             */
            data_mode: "SNAPSHOT";
            /**
             * Data Version
             * @default synthetic-first-purchase-data/v1
             * @constant
             */
            data_version: "synthetic-first-purchase-data/v1";
            /**
             * Endorsement
             * @constant
             */
            endorsement: "PERSONAL";
            facts: components["schemas"]["FirstPurchaseFacts"];
            /** Filter Hash */
            filter_hash: string;
            filters: components["schemas"]["FirstPurchaseQueryRequest"];
            /**
             * Finite Mock
             * @constant
             */
            finite_mock: true;
            /**
             * Http Api
             * @default CONNECTED
             * @constant
             */
            http_api: "CONNECTED";
            /** Limitations */
            limitations: string[];
            /** Metric Refs */
            metric_refs: components["schemas"]["FirstPurchaseMetricRef"][];
            /** Owner Id */
            owner_id: string;
            query_ref: components["schemas"]["FirstPurchaseQueryRef"];
            /**
             * Schema Version
             * @default analytics-first-purchase-saved-analysis/v1
             * @constant
             */
            schema_version: "analytics-first-purchase-saved-analysis/v1";
            snapshot: components["schemas"]["FirstPurchaseSavedSnapshot"];
            /** Title */
            title: string;
            /** Version */
            version: number;
            /**
             * Visibility
             * @constant
             */
            visibility: "PRIVATE";
            visual_spec: components["schemas"]["FirstPurchaseVisualSpec"];
        };
        /** FirstPurchaseSavedAnalysisList */
        FirstPurchaseSavedAnalysisList: {
            /** Items */
            items: components["schemas"]["FirstPurchaseSavedAnalysisListItem"][];
            /**
             * Schema Version
             * @default analytics-first-purchase-saved-analysis/v1
             * @constant
             */
            schema_version: "analytics-first-purchase-saved-analysis/v1";
        };
        /** FirstPurchaseSavedAnalysisListItem */
        FirstPurchaseSavedAnalysisListItem: {
            /** Analysis Id */
            analysis_id: string;
            /** As Of */
            as_of: string;
            cohort_window: components["schemas"]["FirstPurchaseFixedWindow"];
            /**
             * Data Mode
             * @constant
             */
            data_mode: "SNAPSHOT";
            /**
             * Finite Mock
             * @constant
             */
            finite_mock: true;
            /**
             * Http Api
             * @default CONNECTED
             * @constant
             */
            http_api: "CONNECTED";
            /**
             * Observation Days
             * @enum {integer}
             */
            observation_days: 30 | 60 | 90;
            /**
             * Query Id
             * @default first_purchase_product_path
             * @constant
             */
            query_id: "first_purchase_product_path";
            /**
             * Schema Version
             * @default analytics-first-purchase-saved-analysis/v1
             * @constant
             */
            schema_version: "analytics-first-purchase-saved-analysis/v1";
            /** Title */
            title: string;
            /** Version */
            version: number;
            /**
             * Visibility
             * @constant
             */
            visibility: "PRIVATE";
        };
        /**
         * FirstPurchaseSavedProvenance
         * @description Immutable evidence at save time, not a fresh authorization to save again.
         */
        FirstPurchaseSavedProvenance: {
            analysis_ref: components["schemas"]["FirstPurchaseAnalysisRef"];
            /**
             * Api Version
             * @default 1.0.0
             * @constant
             */
            api_version: "1.0.0";
            /**
             * Finite Mock
             * @default true
             * @constant
             */
            finite_mock: true;
            identity: components["schemas"]["FirstPurchaseSaveIdentity"];
            provenance: components["schemas"]["FirstPurchaseSaveProvenance"];
            /**
             * Schema Version
             * @default analytics-first-purchase-saved-provenance/v1
             * @constant
             */
            schema_version: "analytics-first-purchase-saved-provenance/v1";
        };
        /** FirstPurchaseSavedReceipt */
        FirstPurchaseSavedReceipt: {
            analysis_ref: components["schemas"]["FirstPurchaseAnalysisRef"];
            /**
             * Api Version
             * @default 1.0.0
             * @constant
             */
            api_version: "1.0.0";
            /** Durable State Key */
            durable_state_key: string;
            /**
             * Finite Mock
             * @default true
             * @constant
             */
            finite_mock: true;
            /** Idempotency Key */
            idempotency_key: string;
            identity: components["schemas"]["FirstPurchaseSaveIdentity"];
            /** Owner Id */
            owner_id: string;
            /** Reason */
            reason?: null;
            /**
             * Schema Version
             * @default analytics-first-purchase-save-receipt/v1
             * @constant
             */
            schema_version: "analytics-first-purchase-save-receipt/v1";
            /**
             * Service Owner
             * @default analytics-first-purchase
             * @constant
             */
            service_owner: "analytics-first-purchase";
            source_ref: components["schemas"]["FirstPurchaseSaveSourceRef"];
            /**
             * State Schema Version
             * @default 1
             * @constant
             */
            state_schema_version: 1;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            status: "SAVED";
        };
        /** FirstPurchaseSavedSnapshot */
        FirstPurchaseSavedSnapshot: {
            /** As Of */
            as_of: string;
            /**
             * Data Snapshot Ref
             * @default synthetic-first-purchase-v1
             * @constant
             */
            data_snapshot_ref: "synthetic-first-purchase-v1";
            /** Evidence Digest */
            evidence_digest: string;
            resolved_filters: components["schemas"]["FirstPurchaseResolvedFilters"];
            /** Run Id */
            run_id: string;
        };
        /**
         * FirstPurchaseSaveIdentity
         * @description Correlation, not authorization or proof that a candidate is approved.
         */
        FirstPurchaseSaveIdentity: {
            /** Action Id */
            action_id: string;
            /** Candidate Digest */
            candidate_digest: string;
            /** Correlation Id */
            correlation_id: string;
            /**
             * Schema Version
             * @constant
             */
            schema_version: "analytics-first-purchase-save-identity/v1";
        };
        /** FirstPurchaseSaveInspectRequest */
        FirstPurchaseSaveInspectRequest: {
            /** Created From Run Id */
            created_from_run_id: string;
            identity: components["schemas"]["FirstPurchaseSaveIdentity"];
            /**
             * Schema Version
             * @constant
             */
            schema_version: "analytics-first-purchase-save-inspect/v1";
        };
        /** FirstPurchaseSaveProvenance */
        FirstPurchaseSaveProvenance: {
            /** Candidate Digest */
            candidate_digest: string;
            data_time_window: components["schemas"]["FirstPurchaseFixedWindow"];
            /**
             * Environment
             * @default synthetic
             * @constant
             */
            environment: "synthetic";
            freshness: components["schemas"]["FirstPurchaseFreshness"];
            /** Generated At */
            generated_at: string | null;
            permission_scope: components["schemas"]["FirstPurchasePermissionScope"];
            query_scope: components["schemas"]["FirstPurchaseResolvedFilters"];
            source_refs: components["schemas"]["FirstPurchaseProvenanceSourceRefs"];
        };
        /**
         * FirstPurchaseSaveResult
         * @description Separate envelope; native receipt/v1 and cockpit PINNED keep their meaning.
         */
        FirstPurchaseSaveResult: {
            /**
             * Api Version
             * @default 1.0.0
             * @constant
             */
            api_version: "1.0.0";
            /**
             * Finite Mock
             * @default true
             * @constant
             */
            finite_mock: true;
            identity: components["schemas"]["FirstPurchaseSaveIdentity"];
            provenance: components["schemas"]["FirstPurchaseSaveProvenance"];
            result: components["schemas"]["FirstPurchaseResult"];
            /**
             * Result State
             * @enum {string}
             */
            result_state: "SUCCESS_UNSAVED" | "SAVED" | "PARTIAL";
            /** Save Eligible */
            save_eligible: boolean;
            /** Save Ineligible Reason */
            save_ineligible_reason: ("ALREADY_SAVED" | "PROVENANCE_INCOMPLETE" | "PERMISSION_DENIED" | "CANDIDATE_NOT_ADMITTED" | "POLICY_NOT_CONFIGURED" | "RESULT_STALE" | "RESULT_EXPIRED" | "FRESHNESS_UNKNOWN") | null;
            /**
             * Schema Version
             * @default analytics-first-purchase-save-result/v1
             * @constant
             */
            schema_version: "analytics-first-purchase-save-result/v1";
        };
        /** FirstPurchaseSaveSourceRef */
        FirstPurchaseSaveSourceRef: {
            /** Created From Run Id */
            created_from_run_id: string;
            /**
             * Data Scope
             * @default first-purchase-fixture
             * @constant
             */
            data_scope: "first-purchase-fixture";
            /** Evidence Digest */
            evidence_digest: string;
            /**
             * Service Owner
             * @default analytics-first-purchase
             * @constant
             */
            service_owner: "analytics-first-purchase";
        };
        /**
         * FirstPurchaseUnknownSaveReceipt
         * @description No committed receipt visible; never proof that a request was not received.
         */
        FirstPurchaseUnknownSaveReceipt: {
            /** Analysis Ref */
            analysis_ref?: null;
            /**
             * Api Version
             * @default 1.0.0
             * @constant
             */
            api_version: "1.0.0";
            /** Durable State Key */
            durable_state_key?: null;
            /**
             * Finite Mock
             * @default true
             * @constant
             */
            finite_mock: true;
            /** Idempotency Key */
            idempotency_key: string;
            identity: components["schemas"]["FirstPurchaseSaveIdentity"];
            /** Owner Id */
            owner_id: string;
            /**
             * Reason
             * @default RECEIPT_NOT_FOUND
             * @constant
             */
            reason: "RECEIPT_NOT_FOUND";
            /**
             * Schema Version
             * @default analytics-first-purchase-save-receipt/v1
             * @constant
             */
            schema_version: "analytics-first-purchase-save-receipt/v1";
            /**
             * Service Owner
             * @default analytics-first-purchase
             * @constant
             */
            service_owner: "analytics-first-purchase";
            /** Source Ref */
            source_ref?: null;
            /**
             * State Schema Version
             * @default 1
             * @constant
             */
            state_schema_version: 1;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            status: "SAVE_UNKNOWN";
        };
        /** FirstPurchaseVisualSpec */
        FirstPurchaseVisualSpec: {
            /**
             * Kind
             * @default TABLE
             * @constant
             */
            kind: "TABLE";
            /**
             * Schema Version
             * @default analytics-visual-table/v1
             * @constant
             */
            schema_version: "analytics-visual-table/v1";
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
    analytics_first_purchase_analysis_list: {
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
                    "application/json": components["schemas"]["FirstPurchaseSavedAnalysisList"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Gone */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Content Too Large */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
        };
    };
    analytics_first_purchase_analysis_create: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FirstPurchaseAnalysisCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FirstPurchaseSavedAnalysis"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Gone */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Content Too Large */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
        };
    };
    analytics_first_purchase_analysis_get: {
        parameters: {
            query?: {
                version?: number | null;
            };
            header?: never;
            path: {
                analysis_id: string;
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
                    "application/json": components["schemas"]["FirstPurchaseSavedAnalysis"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Gone */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Content Too Large */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
        };
    };
    analytics_first_purchase_saved_provenance_get: {
        parameters: {
            query?: {
                version?: number | null;
            };
            header?: never;
            path: {
                analysis_id: string;
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
                    "application/json": components["schemas"]["FirstPurchaseSavedProvenance"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Gone */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Content Too Large */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
        };
    };
    analytics_first_purchase_analysis_publish_title: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
                "If-Match": string;
            };
            path: {
                analysis_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FirstPurchaseAnalysisTitleRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FirstPurchaseSavedAnalysis"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Gone */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Content Too Large */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
        };
    };
    analytics_first_purchase_save_receipt_create: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FirstPurchaseSaveCommand"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FirstPurchaseSavedReceipt"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Gone */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Content Too Large */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
        };
    };
    analytics_first_purchase_save_receipt_reconcile: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FirstPurchaseSaveIdentity"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FirstPurchaseSavedReceipt"] | components["schemas"]["FirstPurchaseUnknownSaveReceipt"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Gone */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Content Too Large */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
        };
    };
    analytics_first_purchase_save_result_inspect: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FirstPurchaseSaveInspectRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FirstPurchaseSaveResult"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Gone */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Content Too Large */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsErrorResponse"];
                };
            };
        };
    };
}
