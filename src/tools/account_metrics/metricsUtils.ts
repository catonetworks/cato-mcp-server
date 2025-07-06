import {log} from "../../utils/mcpLogger.js";
import {LoggingLevelSchema} from "@modelcontextprotocol/sdk/types.js";

// Constants
export const DEFAULT_TIMEFRAME = "last.P1D";
export const DEFAULT_BUCKETS = 24;
export const DEFAULT_TOP_N = 5;

export const HEALTH_THRESHOLDS = {
    RTT: 150,
    PACKET_LOSS: 2,
    JITTER: 30
};

// Fallback values for grouping when data is missing or undefined
export const FALLBACK_VALUES = {
    UNKNOWN: 'Unknown',
    NONE: 'NONE',
    PRIMARY: 'PRIMARY',
    SECONDARY: 'SECONDARY',
    IN_OFFICE: 'In-Office',
    REMOTE: 'Remote'
};

// Common aggregation functions
export const AGGREGATION_FUNCTIONS = {
    sum: (values: number[]) => values.reduce((sum, val) => sum + val, 0),
    avg: (values: number[]) => values.reduce((sum, val) => sum + val, 0) / values.length,
    max: (values: number[]) => Math.max(...values),
    min: (values: number[]) => Math.min(...values)
};

// Input standardization
export function standardizeMetricsInput(variables: Record<string, any>): Record<string, any> {
    if (!variables.siteIDs) {
        variables.siteIDs = null;
    }
    if (!variables.userIDs) {
        variables.userIDs = null;
    }
    if (!variables.annotationTypes) {
        variables.annotationTypes = null;
    }
    return variables;
}

// Metric calculations
export function calculateBytesTotal(bytesUpstream: number, bytesDownstream: number): number {
    return (bytesUpstream || 0) + (bytesDownstream || 0);
}

export function calculateHostUtilization(hostCount: number, hostLimit: number): number {
    return hostLimit > 0 ? (hostCount / hostLimit) * 100 : 0;
}

export function calculateUpstreamDownstreamRatio(bytesUpstream: number, bytesDownstream: number): number {
    return bytesDownstream > 0 ? bytesUpstream / bytesDownstream : 0;
}

// Aggregation helper
export function aggregateValues(values: number[], aggregationFn: string): number {
    const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (validValues.length === 0) {
        return 0;
    }
    
    const fn = AGGREGATION_FUNCTIONS[aggregationFn as keyof typeof AGGREGATION_FUNCTIONS];
    return fn ? fn(validValues) : AGGREGATION_FUNCTIONS.avg(validValues);
}

// Summary calculation for timeseries data
export function calculateSummary(dataPoints: number[][], aggregationFn: string): any {
    if (!dataPoints || dataPoints.length === 0) {
        return { min: 0, max: 0, avg: 0, peak: { value: 0, timestamp: null } };
    }

    const values = dataPoints.map(point => point[1]).filter(val => val !== null && val !== undefined && val >= 0);
    
    if (values.length === 0) {
        return { min: 0, max: 0, avg: 0, peak: { value: 0, timestamp: null } };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    // Find peak value and its timestamp
    const maxIndex = dataPoints.findIndex(point => point[1] === max);
    const peakTimestamp = maxIndex >= 0 ? new Date(dataPoints[maxIndex][0]).toISOString() : null;

    return {
        min: min,
        max: max,
        avg: avg,
        peak: {
            value: max,
            timestamp: peakTimestamp
        }
    };
}

// Health flag generation
export function generateHealthFlags(metrics: any, thresholds: any): string[] {
    const flags: string[] = [];
    
    if (thresholds.rtt && metrics.rtt > thresholds.rtt) {
        flags.push(`High RTT (${metrics.rtt.toFixed(1)}ms > ${thresholds.rtt}ms)`);
    }
    if (thresholds.packetLoss) {
        if (metrics.lostUpstreamPcnt > thresholds.packetLoss) {
            flags.push(`High upstream packet loss (${metrics.lostUpstreamPcnt.toFixed(1)}% > ${thresholds.packetLoss}%)`);
        }
        if (metrics.lostDownstreamPcnt > thresholds.packetLoss) {
            flags.push(`High downstream packet loss (${metrics.lostDownstreamPcnt.toFixed(1)}% > ${thresholds.packetLoss}%)`);
        }
    }
    if (thresholds.jitter) {
        if (metrics.jitterUpstream > thresholds.jitter) {
            flags.push(`High upstream jitter (${metrics.jitterUpstream.toFixed(1)}ms > ${thresholds.jitter}ms)`);
        }
        if (metrics.jitterDownstream > thresholds.jitter) {
            flags.push(`High downstream jitter (${metrics.jitterDownstream.toFixed(1)}ms > ${thresholds.jitter}ms)`);
        }
    }
    if (thresholds.hostUtilization && metrics.hostUtilizationPct > thresholds.hostUtilization) {
        flags.push(`High capacity utilization (${metrics.hostUtilizationPct.toFixed(1)}% > ${thresholds.hostUtilization}%)`);
    }
    
    return flags;
}

// Group key generators
export const GROUP_KEY_GENERATORS = {
    site: (site: any) => `${site.info?.name || site.id}`,
    siteType: (site: any) => site.info?.type || FALLBACK_VALUES.UNKNOWN,
    connType: (site: any) => site.info?.connType || FALLBACK_VALUES.UNKNOWN,
    region: (site: any) => site.info?.region || FALLBACK_VALUES.UNKNOWN,
    interfaceRole: (intf: any) => intf.interfaceInfo?.wanRole || FALLBACK_VALUES.NONE,
    interfaceName: (intf: any) => intf.name || FALLBACK_VALUES.UNKNOWN,
    socketHA: (intf: any) => intf.socketInfo?.isPrimary ? FALLBACK_VALUES.PRIMARY : FALLBACK_VALUES.SECONDARY,
    // User-specific grouping options
    user: (user: any) => `${user.info?.name || user.name || user.id}`,
    osType: (user: any) => user.info?.osType || FALLBACK_VALUES.UNKNOWN,
    clientVersion: (user: any) => user.info?.version || FALLBACK_VALUES.UNKNOWN,
    popName: (user: any) => user.info?.popName || FALLBACK_VALUES.UNKNOWN,
    connectionStatus: (user: any) => user.info?.connectivityStatus || FALLBACK_VALUES.UNKNOWN,
    inOffice: (user: any) => user.info?.connectedInOffice ? FALLBACK_VALUES.IN_OFFICE : FALLBACK_VALUES.REMOTE
};

// Sort results helper
export function sortResults(results: any[], sortBy: string, sortOrder: string = 'desc'): any[] {
    if (!sortBy || results.length === 0 || !results[0].hasOwnProperty(sortBy)) {
        return results;
    }
    
    return results.sort((a, b) => {
        const aVal = a[sortBy] || 0;
        const bVal = b[sortBy] || 0;
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
}

export function isValidMetricResponse(accountId: string, response: any): boolean {

    if (response.data?.accountMetrics?.sites) {
        return true;
    }

    log(LoggingLevelSchema.Enum.debug, `No site metrics found in account metrics for account ID: ${accountId}`);
    return false;
}

export function emptyMetricsResponse(accountMetrics: any): any {
    return {
        "data": {
            "timeFrame": {
                "from": accountMetrics?.from,
                "to": accountMetrics?.to,
            },
            "sites": []
        },
    }
}

export function formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) {
        return '0 Bytes';
    }

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    const converted = bytes / Math.pow(k, i);
    return `${parseFloat(converted.toFixed(dm))} ${sizes[i]}`;
} 