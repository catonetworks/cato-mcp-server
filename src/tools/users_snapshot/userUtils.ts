import {log} from "../../utils/mcpLogger.js";
import {LoggingLevelSchema} from "@modelcontextprotocol/sdk/types.js";

export function isValidResponse(accountId: string, response: any): boolean {

    if (response.data?.accountSnapshot?.users) {
        return true;
    }

    log(LoggingLevelSchema.Enum.debug, `No users found in account snapshot for remote_users_details account ID: ${accountId}`);
    return false;
}

export function emptyUsersResponse(timestamp: string): any {
    return {
        "data": {
            "accountSnapshotTimestamp": timestamp,
            "users": []
        },
    }
}
