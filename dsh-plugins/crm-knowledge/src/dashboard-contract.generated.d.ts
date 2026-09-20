export interface paths {
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
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
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
}
