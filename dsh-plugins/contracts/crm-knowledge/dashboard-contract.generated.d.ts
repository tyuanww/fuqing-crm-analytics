export interface paths {
    "/api/v1/metrics/crm-analyses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search Crm Analyses */
        get: operations["search_crm_analyses_api_v1_metrics_crm_analyses_get"];
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
        /** Patch Crm Analysis */
        patch: operations["patch_crm_analysis_api_v1_metrics_crm_analyses__asset_id__patch"];
        trace?: never;
    };
    "/api/v1/metrics/crm-analyses/{asset_id}/knowledge-citations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Bind Crm Analysis Citations */
        post: operations["bind_crm_analysis_citations_api_v1_metrics_crm_analyses__asset_id__knowledge_citations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics/crm-analyses/{asset_id}/shares": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Crm Analysis Shares */
        get: operations["list_crm_analysis_shares_api_v1_metrics_crm_analyses__asset_id__shares_get"];
        put?: never;
        /** Share Crm Analysis */
        post: operations["share_crm_analysis_api_v1_metrics_crm_analyses__asset_id__shares_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics/crm-analyses/{asset_id}/shares/{username}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke Crm Analysis Share */
        post: operations["revoke_crm_analysis_share_api_v1_metrics_crm_analyses__asset_id__shares__username__revoke_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics/crm-boards": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search Crm Boards */
        get: operations["search_crm_boards_api_v1_metrics_crm_boards_get"];
        put?: never;
        /** Save Crm Board */
        post: operations["save_crm_board_api_v1_metrics_crm_boards_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics/crm-boards/{asset_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Crm Board */
        get: operations["read_crm_board_api_v1_metrics_crm_boards__asset_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Patch Crm Board */
        patch: operations["patch_crm_board_api_v1_metrics_crm_boards__asset_id__patch"];
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
    "/api/v1/metrics/dashboard-membership": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Dashboard Membership
         * @description 成交时会员溢价；缺快照或事件时不可用，不使用当前 is_member。
         */
        get: operations["get_dashboard_membership_api_v1_metrics_dashboard_membership_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics/dashboard-net-gsv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Dashboard Net Gsv
         * @description 扣实际成功退款的净额 GSV，与看板 GSV 分列。缺退款事件时不可用。
         */
        get: operations["get_dashboard_net_gsv_api_v1_metrics_dashboard_net_gsv_get"];
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
    "/api/v1/metrics/dashboard-readiness": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Dashboard Readiness
         * @description 当前连接的指标来源具备程度；只读元数据，不扫描明细。
         */
        get: operations["get_dashboard_readiness_api_v1_metrics_dashboard_readiness_get"];
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
             * Description
             * @default
             */
            description: string;
            /** Knowledge Citations */
            knowledge_citations?: components["schemas"]["CrmKnowledgeCitation"][];
            /**
             * Revision
             * @default 1
             */
            revision: number;
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
            /** Updated At */
            updated_at?: string | null;
        };
        /** CrmAnalysisPage */
        CrmAnalysisPage: {
            /**
             * Data Kind
             * @enum {string}
             */
            data_kind: "real" | "synthetic";
            /** Items */
            items: components["schemas"]["CrmAnalysisSummary"][];
            /** Next Cursor */
            next_cursor?: string | null;
            /**
             * Schema Version
             * @default crm-analysis-page/v1
             * @constant
             */
            schema_version: "crm-analysis-page/v1";
        };
        /** CrmAnalysisSummary */
        CrmAnalysisSummary: {
            /**
             * Access
             * @enum {string}
             */
            access: "owner" | "shared";
            /** Analysis Id */
            analysis_id: string;
            /** Description */
            description: string;
            filters: components["schemas"]["DashboardFilters"];
            /** Revision */
            revision: number;
            /**
             * Saved At
             * Format: date-time
             */
            saved_at: string;
            /**
             * Schema Version
             * @default crm-saved-analysis-summary/v1
             * @constant
             */
            schema_version: "crm-saved-analysis-summary/v1";
            /** Snapshot Id */
            snapshot_id: string;
            /** Title */
            title: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** CrmBindCitations */
        CrmBindCitations: {
            /** Citations */
            citations: components["schemas"]["CrmKnowledgeCitation"][];
        };
        /** CrmBoard */
        CrmBoard: {
            /** Board Id */
            board_id: string;
            /** Components */
            components: components["schemas"]["CrmBoardComponent"][];
            /**
             * Description
             * @default
             */
            description: string;
            /** Revision */
            revision: number;
            /**
             * Saved At
             * Format: date-time
             */
            saved_at: string;
            /**
             * Schema Version
             * @default crm-board/v1
             * @constant
             */
            schema_version: "crm-board/v1";
            /** Title */
            title: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** CrmBoardComponent */
        CrmBoardComponent: {
            /** Analysis Id */
            analysis_id: string;
            /** Block Id */
            block_id: string;
            /**
             * @default {
             *       "tone": "neutral",
             *       "density": "comfortable",
             *       "value_format": "standard",
             *       "show_coverage": true
             *     }
             */
            display: components["schemas"]["CrmBoardDisplay"];
            filters: components["schemas"]["DashboardFilters"];
            layout: components["schemas"]["CrmBoardLayout"];
            /**
             * Metric
             * @enum {string}
             */
            metric: "gsv" | "aov" | "aus" | "orders" | "buyers";
            /**
             * Metric Version
             * @constant
             */
            metric_version: "dashboard-gsv-purchases/v1";
            /** Result Sha256 */
            result_sha256: string;
            /** Snapshot Id */
            snapshot_id: string;
            /** Title */
            title: string;
            value: components["schemas"]["CrmMetricValue"];
        };
        /** CrmBoardComponentDraft */
        CrmBoardComponentDraft: {
            /** Analysis Id */
            analysis_id: string;
            /** Block Id */
            block_id: string;
            /**
             * @default {
             *       "tone": "neutral",
             *       "density": "comfortable",
             *       "value_format": "standard",
             *       "show_coverage": true
             *     }
             */
            display: components["schemas"]["CrmBoardDisplay"];
            layout: components["schemas"]["CrmBoardLayout"];
            /**
             * Metric
             * @enum {string}
             */
            metric: "gsv" | "aov" | "aus" | "orders" | "buyers";
            /** Snapshot Id */
            snapshot_id: string;
            /** Title */
            title: string;
        };
        /** CrmBoardDisplay */
        CrmBoardDisplay: {
            /**
             * Density
             * @default comfortable
             * @enum {string}
             */
            density: "comfortable" | "compact";
            /**
             * Show Coverage
             * @default true
             */
            show_coverage: boolean;
            /**
             * Tone
             * @default neutral
             * @enum {string}
             */
            tone: "neutral" | "accent" | "muted";
            /**
             * Value Format
             * @default standard
             * @enum {string}
             */
            value_format: "standard" | "compact";
        };
        /** CrmBoardLayout */
        CrmBoardLayout: {
            /** H */
            h: number;
            /** W */
            w: number;
            /** X */
            x: number;
            /** Y */
            y: number;
        };
        /** CrmBoardPage */
        CrmBoardPage: {
            /**
             * Data Kind
             * @enum {string}
             */
            data_kind: "real" | "synthetic";
            /** Items */
            items: components["schemas"]["CrmBoardSummary"][];
            /** Next Cursor */
            next_cursor?: string | null;
            /**
             * Schema Version
             * @default crm-board-page/v1
             * @constant
             */
            schema_version: "crm-board-page/v1";
        };
        /** CrmBoardPatch */
        CrmBoardPatch: {
            /** Base Revision */
            base_revision: number;
            /** Components */
            components: components["schemas"]["CrmBoardComponentDraft"][];
            /**
             * Description
             * @default
             */
            description: string;
            /** Title */
            title: string;
        };
        /** CrmBoardSummary */
        CrmBoardSummary: {
            /** Board Id */
            board_id: string;
            /** Component Count */
            component_count: number;
            /** Description */
            description: string;
            /** Revision */
            revision: number;
            /**
             * Saved At
             * Format: date-time
             */
            saved_at: string;
            /**
             * Schema Version
             * @default crm-board-summary/v1
             * @constant
             */
            schema_version: "crm-board-summary/v1";
            /** Title */
            title: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** CrmBoardWrite */
        CrmBoardWrite: {
            /** Components */
            components: components["schemas"]["CrmBoardComponentDraft"][];
            /**
             * Description
             * @default
             */
            description: string;
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
        /** CrmKnowledgeCitation */
        CrmKnowledgeCitation: {
            /** Chunk Id */
            chunk_id: string;
            /** Content Sha256 */
            content_sha256: string;
            /** Knowledge Base Id */
            knowledge_base_id: string;
            /** Knowledge Id */
            knowledge_id: string;
            /** Processed At */
            processed_at?: string | null;
            /**
             * Schema Version
             * @default crm-knowledge-citation/v1
             * @constant
             */
            schema_version: "crm-knowledge-citation/v1";
            /** Title */
            title: string;
            /** Updated At */
            updated_at?: string | null;
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
        /** CrmMetricValue */
        CrmMetricValue: {
            /** Amount Fen */
            amount_fen?: number | null;
            /** Count */
            count?: number | null;
            /** Denominator */
            denominator?: number | null;
            /** Reason */
            reason?: string | null;
        };
        /** CrmPatchAnalysis */
        CrmPatchAnalysis: {
            /** Base Revision */
            base_revision: number;
            /**
             * Description
             * @default
             */
            description: string;
            /** Title */
            title: string;
        };
        /** CrmSaveAnalysis */
        CrmSaveAnalysis: {
            /**
             * Description
             * @default
             */
            description: string;
            /** Snapshot Id */
            snapshot_id: string;
            /** Title */
            title: string;
        };
        /** CrmShareGrant */
        CrmShareGrant: {
            /**
             * Granted At
             * Format: date-time
             */
            granted_at: string;
            /** Username */
            username: string;
        };
        /** CrmShareList */
        CrmShareList: {
            /** Analysis Id */
            analysis_id: string;
            /** Grants */
            grants: components["schemas"]["CrmShareGrant"][];
            /**
             * Schema Version
             * @default crm-analysis-shares/v1
             * @constant
             */
            schema_version: "crm-analysis-shares/v1";
        };
        /** CrmShareRequest */
        CrmShareRequest: {
            /** Username */
            username: string;
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
        /** DashboardMembership */
        DashboardMembership: {
            coverage: components["schemas"]["DashboardMembershipCoverage"] | null;
            /** Data Through */
            data_through?: null;
            filters: components["schemas"]["DashboardFilters"];
            /** Limitations */
            limitations: string[];
            member_aus: components["schemas"]["DashboardAverage"] | null;
            /** Member Gsv Amount Fen */
            member_gsv_amount_fen: number | null;
            /**
             * Metric Version
             * @default dashboard-member-premium/v1
             * @constant
             */
            metric_version: "dashboard-member-premium/v1";
            non_member_aus: components["schemas"]["DashboardAverage"] | null;
            /** Non Member Gsv Amount Fen */
            non_member_gsv_amount_fen: number | null;
            premium: components["schemas"]["DashboardMultiple"] | null;
            /** Reason */
            reason: "MEMBERSHIP_AT_PURCHASE_UNAVAILABLE" | null;
            /** Refund As Of */
            refund_as_of?: null;
            /** Required Fields */
            required_fields: string[];
            /**
             * Schema Version
             * @default crm-dashboard-membership/v1
             * @constant
             */
            schema_version: "crm-dashboard-membership/v1";
            /** Source System */
            source_system: string;
            /**
             * Status
             * @enum {string}
             */
            status: "OK" | "UNAVAILABLE";
            /** Unknown Member Gsv Amount Fen */
            unknown_member_gsv_amount_fen: number | null;
            /** Unlock */
            unlock: string;
        };
        /** DashboardMembershipCoverage */
        DashboardMembershipCoverage: {
            /** Member Buyers */
            member_buyers: number;
            /** Member Orders */
            member_orders: number;
            /** Negative Amount Rows */
            negative_amount_rows: number;
            /** Non Member Buyers */
            non_member_buyers: number;
            /** Non Member Orders */
            non_member_orders: number;
            /** Null Amount Rows */
            null_amount_rows: number;
            /** Unknown Buyer Rows */
            unknown_buyer_rows: number;
            /** Unknown Member Buyers */
            unknown_member_buyers: number;
            /** Unknown Member Orders */
            unknown_member_orders: number;
            /** Unknown Order Rows */
            unknown_order_rows: number;
        };
        /** DashboardMultiple */
        DashboardMultiple: {
            /** Reason */
            reason: ("UNAVAILABLE" | "ZERO_DENOMINATOR" | "INCOMPARABLE_BASE" | "UNKNOWN_IDENTITY" | "INVALID_AMOUNT" | "NO_PURCHASES") | null;
            /**
             * Unit
             * @default multiple
             * @constant
             */
            unit: "multiple";
            /** Value */
            value: number | null;
        };
        /** DashboardNetGsv */
        DashboardNetGsv: {
            /** Data Through */
            data_through?: null;
            filters: components["schemas"]["DashboardFilters"];
            /** Gross Paid Fen */
            gross_paid_fen: number | null;
            /** Limitations */
            limitations: string[];
            /**
             * Metric Version
             * @default dashboard-net-gsv/v1
             * @constant
             */
            metric_version: "dashboard-net-gsv/v1";
            /** Net Gsv Amount Fen */
            net_gsv_amount_fen: number | null;
            /** Parent Child Attributed */
            parent_child_attributed: boolean;
            /** Reason */
            reason: ("MISSING_REFUND_EVENTS" | "AMOUNT_ALREADY_NET_CONFLICT") | null;
            /** Refund As Of */
            refund_as_of: string | null;
            /** Required Fields */
            required_fields: string[];
            /**
             * Schema Version
             * @default crm-dashboard-net-gsv/v1
             * @constant
             */
            schema_version: "crm-dashboard-net-gsv/v1";
            /** Source System */
            source_system: string;
            /**
             * Status
             * @enum {string}
             */
            status: "OK" | "UNAVAILABLE";
            /** Succeeded Refund Fen */
            succeeded_refund_fen: number | null;
            /** Unlock */
            unlock: string;
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
        /** DashboardReadiness */
        DashboardReadiness: {
            /** Data Through */
            data_through?: null;
            inventory: components["schemas"]["DashboardSourceInventory"];
            /** Limitations */
            limitations: string[];
            /**
             * Metric Version
             * @default dashboard-readiness/v1
             * @constant
             */
            metric_version: "dashboard-readiness/v1";
            /** Metrics */
            metrics: components["schemas"]["MetricReadinessItem"][];
            /** Refund As Of */
            refund_as_of?: null;
            /**
             * Schema Version
             * @default crm-dashboard-readiness/v1
             * @constant
             */
            schema_version: "crm-dashboard-readiness/v1";
        };
        /** DashboardSourceInventory */
        DashboardSourceInventory: {
            /** Has Cost Profit */
            has_cost_profit: boolean;
            /** Has Dashboard Gsv Fields */
            has_dashboard_gsv_fields: boolean;
            /** Has First Purchase As Of */
            has_first_purchase_as_of: boolean;
            /** Has Is Member Current */
            has_is_member_current: boolean;
            /** Has Membership At Purchase */
            has_membership_at_purchase: boolean;
            /** Has Membership Events */
            has_membership_events: boolean;
            /** Has Parent Order Id */
            has_parent_order_id: boolean;
            /** Has Refund Events */
            has_refund_events: boolean;
            /** Has Refund Succeeded At */
            has_refund_succeeded_at: boolean;
            /** Has Sample Qualification */
            has_sample_qualification: boolean;
            /** Has Sample Received At */
            has_sample_received_at: boolean;
            /** Rejected Substitutes */
            rejected_substitutes: string[];
            /**
             * Schema Version
             * @default crm-dashboard-source/v1
             * @constant
             */
            schema_version: "crm-dashboard-source/v1";
            /** Tables */
            tables: string[];
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** MetricReadinessItem */
        MetricReadinessItem: {
            /**
             * Acceptance Class
             * @enum {string}
             */
            acceptance_class: "A" | "B" | "C";
            /** Formula */
            formula: string;
            /** Gap */
            gap: string;
            /** Metric Id */
            metric_id: string;
            /** Name */
            name: string;
            /** Required Fields */
            required_fields: string[];
            /** Source */
            source: string;
            /** Source Present */
            source_present: boolean;
            /** Source System */
            source_system: string;
            /** Unlock */
            unlock: string;
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
    search_crm_analyses_api_v1_metrics_crm_analyses_get: {
        parameters: {
            query?: {
                cursor?: string | null;
                limit?: number;
                q?: string;
                scope?: string;
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
                    "application/json": components["schemas"]["CrmAnalysisPage"];
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
    patch_crm_analysis_api_v1_metrics_crm_analyses__asset_id__patch: {
        parameters: {
            query?: never;
            header?: {
                "idempotency-key"?: string | null;
            };
            path: {
                asset_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrmPatchAnalysis"];
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
    bind_crm_analysis_citations_api_v1_metrics_crm_analyses__asset_id__knowledge_citations_post: {
        parameters: {
            query?: never;
            header?: {
                "idempotency-key"?: string | null;
            };
            path: {
                asset_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrmBindCitations"];
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
    list_crm_analysis_shares_api_v1_metrics_crm_analyses__asset_id__shares_get: {
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
                    "application/json": components["schemas"]["CrmShareList"];
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
    share_crm_analysis_api_v1_metrics_crm_analyses__asset_id__shares_post: {
        parameters: {
            query?: never;
            header?: {
                "idempotency-key"?: string | null;
            };
            path: {
                asset_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrmShareRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrmShareList"];
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
    revoke_crm_analysis_share_api_v1_metrics_crm_analyses__asset_id__shares__username__revoke_post: {
        parameters: {
            query?: never;
            header?: {
                "idempotency-key"?: string | null;
            };
            path: {
                asset_id: string;
                username: string;
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
                    "application/json": components["schemas"]["CrmShareList"];
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
    search_crm_boards_api_v1_metrics_crm_boards_get: {
        parameters: {
            query?: {
                cursor?: string | null;
                limit?: number;
                q?: string;
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
                    "application/json": components["schemas"]["CrmBoardPage"];
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
    save_crm_board_api_v1_metrics_crm_boards_post: {
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
                "application/json": components["schemas"]["CrmBoardWrite"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrmBoard"];
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
    read_crm_board_api_v1_metrics_crm_boards__asset_id__get: {
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
                    "application/json": components["schemas"]["CrmBoard"];
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
    patch_crm_board_api_v1_metrics_crm_boards__asset_id__patch: {
        parameters: {
            query?: never;
            header?: {
                "idempotency-key"?: string | null;
            };
            path: {
                asset_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrmBoardPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrmBoard"];
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
    get_dashboard_membership_api_v1_metrics_dashboard_membership_get: {
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
                    "application/json": components["schemas"]["DashboardMembership"];
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
    get_dashboard_net_gsv_api_v1_metrics_dashboard_net_gsv_get: {
        parameters: {
            query: {
                channel?: "全店" | "纯派样" | "货架" | "达播" | "直播" | "淘客" | "微博" | "U先派样" | "百补派样" | "赠品&0.01" | "其他";
                end_date: string;
                exclude_low_price?: boolean;
                refund_as_of: string;
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
                    "application/json": components["schemas"]["DashboardNetGsv"];
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
    get_dashboard_readiness_api_v1_metrics_dashboard_readiness_get: {
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
                    "application/json": components["schemas"]["DashboardReadiness"];
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
