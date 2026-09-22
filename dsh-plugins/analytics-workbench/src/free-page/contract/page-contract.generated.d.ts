/** Generated free-page contract; do not edit. OpenAPI SHA-256: ddfaa111be4a73fe2d7f51bbf6cd77ece90a93dd3f4c1d429ea41916b11616ca */
export interface paths {
    "/api/v1/analytics/page-documents/pages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["page_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/page-documents/pages/{page_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["page_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/page-documents/pages/{page_id}/patch-preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["page_patch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/page-documents/pages/{page_id}/rollback-preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["page_rollback"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/page-documents/pages/{page_id}/save-preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["page_save"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/page-documents/pages/{page_id}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["page_history"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/page-documents/previews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["page_generate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/page-documents/previews/{preview_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["page_preview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/page-documents/previews/{preview_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["page_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/page-documents/previews/{preview_id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["page_confirm"];
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
        /**
         * CAS
         * @description Compare-and-swap precondition. Hashes bind an edit to its exact region.
         */
        CAS: {
            /** Base Version */
            base_version: number;
            /** Idempotency Key */
            idempotency_key: string;
            /** Region Hash */
            region_hash: string;
            /** Source Hash */
            source_hash: string;
        };
        /** EditContext */
        EditContext: {
            /** Capabilities */
            capabilities: string[];
            /** Created At */
            created_at: number;
            /** Edit Context Id */
            edit_context_id: string;
            /** Expires At */
            expires_at: number;
            /** Page Id */
            page_id: string;
            /**
             * Schema Version
             * @default free-page-edit-context/v1
             * @constant
             */
            schema_version: "free-page-edit-context/v1";
            selected_node: components["schemas"]["NodeRef"];
            /** Tenant Id */
            tenant_id: string;
            /** Ttl Ms */
            ttl_ms: number;
            /** User Id */
            user_id: string;
            /** Version */
            version: number;
        };
        /** EditOperation */
        EditOperation: {
            /**
             * Action
             * @enum {string}
             */
            action: "insert" | "update" | "delete" | "move" | "replace";
            /**
             * Byte Length
             * @default 0
             */
            byte_length: number;
            /** Capabilities */
            capabilities: string[];
            cas: components["schemas"]["CAS"];
            /**
             * Channel
             * @enum {string}
             */
            channel: "presentation" | "source" | "logic";
            /** @default null */
            destination: components["schemas"]["SourceRange"] | null;
            /**
             * Encoding
             * @enum {string}
             */
            encoding: "overlay" | "bytes";
            /**
             * Expected Region Hash
             * @default null
             */
            expected_region_hash: string | null;
            node: components["schemas"]["NodeRef"];
            /** Operation Id */
            operation_id: string;
            /**
             * Payload
             * @default null
             */
            payload: string | components["schemas"]["PresentationOverlay"] | null;
            /**
             * Schema Version
             * @default free-page-edit/v1
             * @constant
             */
            schema_version: "free-page-edit/v1";
            selected_scope: components["schemas"]["SelectedScope"];
            /** @default null */
            splice: components["schemas"]["SourceRange"] | null;
        };
        /** NodeRef */
        NodeRef: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "static_element" | "dynamic_region" | "whole_page";
            /** Mapping Token */
            mapping_token: string;
            /** Node Id */
            node_id: string;
            /** Page Id */
            page_id: string;
            /** Region Hash */
            region_hash: string;
            /**
             * Selector
             * @default null
             */
            selector: string | null;
            /** Source Hash */
            source_hash: string;
            /** @default null */
            source_range: components["schemas"]["SourceRange"] | null;
        };
        /** PageBinding */
        PageBinding: {
            /** Binding Id */
            binding_id: string;
            /**
             * Data Ref
             * @default null
             */
            data_ref: string | null;
            /**
             * Mode
             * @default summary
             * @enum {string}
             */
            mode: "summary" | "page" | "range";
            /**
             * Node Id
             * @default null
             */
            node_id: string | null;
            /** Result Ref */
            result_ref: string;
        };
        /** PageBindingManifest */
        PageBindingManifest: {
            /** Bindings */
            bindings?: components["schemas"]["PageBinding"][];
            /** Result Refs */
            result_refs?: string[];
        };
        /** PageBindingStateEvent */
        PageBindingStateEvent: {
            /**
             * Binding State
             * @enum {string}
             */
            binding_state: "UNBOUND_SAMPLE" | "BOUND_VERIFIED" | "BOUND_STALE";
            /** Instance Id */
            instance_id: string;
            /** Nonce */
            nonce: string;
            /**
             * Op
             * @constant
             */
            op: "binding.state";
            /**
             * Protocol
             * @default free-page-bridge/v1
             * @constant
             */
            protocol: "free-page-bridge/v1";
            /** Request Id */
            request_id: string;
            /** Seq */
            seq: number;
        };
        /** PageBridgeHandshake */
        PageBridgeHandshake: {
            /** Instance Id */
            instance_id: string;
            /** Nonce */
            nonce: string;
            /** Page Id */
            page_id: string;
            /**
             * Protocol
             * @default free-page-bridge/v1
             * @constant
             */
            protocol: "free-page-bridge/v1";
            /** Version */
            version: number;
        };
        /** PageCancelResult */
        PageCancelResult: {
            /** Preview Id */
            preview_id: string;
            /**
             * Status
             * @constant
             */
            status: "CANCELLED";
        };
        /** PageDataCancelRequest */
        PageDataCancelRequest: {
            /** Instance Id */
            instance_id: string;
            /** Nonce */
            nonce: string;
            /**
             * Op
             * @constant
             */
            op: "data.cancel";
            /**
             * Protocol
             * @default free-page-bridge/v1
             * @constant
             */
            protocol: "free-page-bridge/v1";
            /** Request Id */
            request_id: string;
            /** Seq */
            seq: number;
        };
        /** PageDataChunkEvent */
        PageDataChunkEvent: {
            /**
             * Byte Length
             * @default null
             */
            byte_length: number | null;
            /** Instance Id */
            instance_id: string;
            /** Nonce */
            nonce: string;
            /**
             * Op
             * @constant
             */
            op: "data.chunk";
            /**
             * Protocol
             * @default free-page-bridge/v1
             * @constant
             */
            protocol: "free-page-bridge/v1";
            /**
             * Queried At
             * @default null
             */
            queried_at: string | null;
            /** Request Id */
            request_id: string;
            /**
             * Row Count
             * @default null
             */
            row_count: number | null;
            /** Seq */
            seq: number;
            /**
             * Source
             * @default null
             */
            source: string | null;
            /**
             * Time Range
             * @default null
             */
            time_range: string | null;
            /**
             * Unit
             * @default null
             */
            unit: string | null;
        };
        /** PageDataEndEvent */
        PageDataEndEvent: {
            /** Instance Id */
            instance_id: string;
            /** Nonce */
            nonce: string;
            /**
             * Op
             * @constant
             */
            op: "data.end";
            /**
             * Protocol
             * @default free-page-bridge/v1
             * @constant
             */
            protocol: "free-page-bridge/v1";
            /** Request Id */
            request_id: string;
            /** Seq */
            seq: number;
        };
        /** PageDataErrorEvent */
        PageDataErrorEvent: {
            /**
             * Code
             * @enum {string}
             */
            code: "RESULT_UNAVAILABLE" | "RESULT_STALE" | "RESULT_REVOKED" | "FORBIDDEN" | "BRIDGE_NONCE" | "BRIDGE_EXPIRED_INSTANCE" | "BRIDGE_UNKNOWN_OP" | "PACKAGE_TOO_LARGE";
            /** Instance Id */
            instance_id: string;
            /** Message */
            message: string;
            /** Nonce */
            nonce: string;
            /**
             * Op
             * @constant
             */
            op: "data.error";
            /**
             * Protocol
             * @default free-page-bridge/v1
             * @constant
             */
            protocol: "free-page-bridge/v1";
            /** Request Id */
            request_id: string;
            /** Seq */
            seq: number;
        };
        /** PageDataReadRequest */
        PageDataReadRequest: {
            /**
             * Cursor
             * @default null
             */
            cursor: string | null;
            /** Instance Id */
            instance_id: string;
            /**
             * Limit
             * @default 50
             */
            limit: number;
            /**
             * Mode
             * @default summary
             * @enum {string}
             */
            mode: "summary" | "page" | "range";
            /** Nonce */
            nonce: string;
            /**
             * Op
             * @constant
             */
            op: "data.read";
            /**
             * Protocol
             * @default free-page-bridge/v1
             * @constant
             */
            protocol: "free-page-bridge/v1";
            /** Request Id */
            request_id: string;
            /** Result Ref */
            result_ref: string;
            /** Seq */
            seq: number;
        };
        /** PageDocument */
        PageDocument: {
            binding_manifest?: components["schemas"]["PageBindingManifest"];
            /**
             * Binding State
             * @enum {string}
             */
            binding_state: "UNBOUND_SAMPLE" | "BOUND_VERIFIED" | "BOUND_STALE";
            /** Origin File Id */
            origin_file_id?: string;
            /** Origin Path */
            origin_path?: string;
            package: components["schemas"]["PagePackage"];
            /** Page Id */
            page_id: string;
            /**
             * Schema Version
             * @default free-page/v1
             * @constant
             */
            schema_version: "free-page/v1";
            /** Session Id */
            session_id: string | null;
            /** Title */
            title: string;
            /** Version */
            version: number;
        };
        /** PageDraft */
        PageDraft: {
            binding_manifest?: components["schemas"]["PageBindingManifest"];
            /** Origin File Id */
            origin_file_id?: string;
            /** Origin Path */
            origin_path?: string;
            package: components["schemas"]["PagePackage"];
            /** Session Id */
            session_id: string | null;
            /** Title */
            title: string;
        };
        /** PageElementKey */
        PageElementKey: {
            /**
             * Attribute
             * @enum {string}
             */
            attribute: "id" | "data-node" | "data-page-block" | "data-page-field" | "class" | "text";
            /** Value */
            value: string;
        };
        /** PageElementStep */
        PageElementStep: {
            key?: components["schemas"]["PageElementKey"] | null;
            /** Tag */
            tag: string;
        };
        /** PageElementTarget */
        PageElementTarget: {
            anchor: components["schemas"]["PageElementKey"];
            /** Path */
            path: components["schemas"]["PageElementStep"][];
        };
        /** PageList */
        PageList: {
            /** Items */
            items: components["schemas"]["PageListItem"][];
        };
        /** PageListItem */
        PageListItem: {
            /**
             * Binding State
             * @enum {string}
             */
            binding_state: "UNBOUND_SAMPLE" | "BOUND_VERIFIED" | "BOUND_STALE";
            /** Origin File Id */
            origin_file_id?: string;
            /** Origin Path */
            origin_path?: string;
            /** Page Id */
            page_id: string;
            /** Session Id */
            session_id: string | null;
            /** Title */
            title: string;
            /** Version */
            version: number;
        };
        /** PageNodeMapEntry */
        PageNodeMapEntry: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "static_element" | "dynamic_region" | "whole_page";
            /** Node Id */
            node_id: string;
            /** Selector */
            selector: string;
        };
        /** PagePackage */
        PagePackage: {
            /**
             * Css
             * @default
             */
            css: string;
            /** Html */
            html: string;
            /**
             * Js
             * @default
             */
            js: string;
            /** Node Map */
            node_map?: components["schemas"]["PageNodeMapEntry"][];
            presentation?: components["schemas"]["PagePresentation"] | null;
            /** Resources */
            resources?: components["schemas"]["PageResource"][];
        };
        /**
         * PagePatchPreview
         * @description D6: patch preview of source and/or manifest. Confirm is a separate call.
         */
        PagePatchPreview: {
            /** Base Version */
            base_version: number;
            binding_manifest?: components["schemas"]["PageBindingManifest"];
            package?: components["schemas"]["PagePackage"];
            /** Title */
            title?: string;
        };
        /** PagePresentation */
        PagePresentation: {
            /** Edits */
            edits?: components["schemas"]["PagePresentationEdit"][];
            /** Source Hash */
            source_hash: string;
            /**
             * Version
             * @default 1
             * @constant
             */
            version: 1;
        };
        /** PagePresentationEdit */
        PagePresentationEdit: {
            /** Style */
            style?: {
                [key: string]: string;
            };
            target: components["schemas"]["PageElementTarget"];
            /** Text */
            text?: string | null;
        };
        /** PagePreview */
        PagePreview: {
            /** Base Version */
            base_version: number;
            /** Expires At Ms */
            expires_at_ms: number;
            /**
             * Operation
             * @enum {string}
             */
            operation: "GENERATE" | "PATCH" | "SAVE" | "ROLLBACK";
            /** Preview Id */
            preview_id: string;
            snapshot: components["schemas"]["PageSnapshot"];
            /**
             * Status
             * @enum {string}
             */
            status: "PENDING" | "APPLIED" | "CANCELLED";
        };
        /** PageResource */
        PageResource: {
            /** Byte Length */
            byte_length: number;
            /** Content Type */
            content_type: string;
            /** Resource Id */
            resource_id: string;
            /** Sha256 */
            sha256: string;
        };
        /** PageRevision */
        PageRevision: {
            /** Created At Ms */
            created_at_ms: number;
            /**
             * Operation
             * @enum {string}
             */
            operation: "GENERATE" | "PATCH" | "SAVE" | "ROLLBACK";
            /** Version */
            version: number;
        };
        /** PageRollbackPreview */
        PageRollbackPreview: {
            /** Base Version */
            base_version: number;
            /** To Version */
            to_version: number;
        };
        /**
         * PageSavePreview
         * @description D9: explicit save of the host in-memory draft. Exit-edit is not save.
         */
        PageSavePreview: {
            /** Base Version */
            base_version: number;
            binding_manifest: components["schemas"]["PageBindingManifest"];
            package: components["schemas"]["PagePackage"];
            /** Title */
            title: string;
        };
        /** PageSnapshot */
        PageSnapshot: {
            spec: components["schemas"]["PageDocument"];
        };
        /**
         * PresentationOverlay
         * @description Presentation writes style, text, and attributes. They do not splice source bytes.
         */
        PresentationOverlay: {
            /**
             * Attributes
             * @default null
             */
            attributes: {
                [key: string]: string;
            } | null;
            /**
             * Style
             * @default null
             */
            style: {
                [key: string]: string;
            } | null;
            /**
             * Text
             * @default null
             */
            text: string | null;
        };
        /** SelectedScope */
        SelectedScope: {
            /** Node Id */
            node_id: string;
            /** Page Id */
            page_id: string;
            /** @default null */
            source_range: components["schemas"]["SourceRange"] | null;
        };
        /** SourceRange */
        SourceRange: {
            /** End */
            end: number;
            /** Start */
            start: number;
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
    page_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Metadata list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageList"];
                };
            };
        };
    };
    page_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                page_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Committed snapshot */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageSnapshot"];
                };
            };
        };
    };
    page_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                page_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PagePatchPreview"];
            };
        };
        responses: {
            /** @description Page preview */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PagePreview"];
                };
            };
        };
    };
    page_rollback: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                page_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PageRollbackPreview"];
            };
        };
        responses: {
            /** @description Page preview */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PagePreview"];
                };
            };
        };
    };
    page_save: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                page_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PageSavePreview"];
            };
        };
        responses: {
            /** @description Page preview */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PagePreview"];
                };
            };
        };
    };
    page_history: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                page_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description History */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageRevision"][];
                };
            };
        };
    };
    page_generate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PageDraft"];
            };
        };
        responses: {
            /** @description Page preview */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PagePreview"];
                };
            };
        };
    };
    page_preview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                preview_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page preview */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PagePreview"];
                };
            };
        };
    };
    page_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                preview_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Cancelled */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageCancelResult"];
                };
            };
        };
    };
    page_confirm: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                preview_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Committed snapshot */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageSnapshot"];
                };
            };
        };
    };
}
