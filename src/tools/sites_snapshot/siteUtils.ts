import {log} from "../../utils/mcpLogger.js";
import {LoggingLevelSchema} from "@modelcontextprotocol/sdk/types.js";

export function isValidResponse(accountId: string, response: any): boolean {

    if (response.data?.accountSnapshot?.sites) {
        return true;
    }

    log(LoggingLevelSchema.Enum.debug, `No sites found in account snapshot for account ID: ${accountId}`);
    return false;
}

export function emptySitesResponse(timestamp: string): any {
    return {
        "data": {
            "accountSnapshotTimestamp": timestamp,
            "sites": []
        },
    }
}
