import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'PPp');
}

export function formatRelativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
    case 'completed':
    case 'healthy':
      return 'text-green-500';
    case 'warning':
    case 'running':
      return 'text-yellow-500';
    case 'error':
    case 'failed':
    case 'inactive':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-500';
  if (confidence >= 0.6) return 'text-yellow-500';
  return 'text-red-500';
}

export function calculateTrend(data: { value: number }[]): {
  trend: 'up' | 'down' | 'stable';
  percentage: number;
} {
  if (data.length < 2) return { trend: 'stable', percentage: 0 };
  
  const recent = data.slice(-10);
  const older = data.slice(-20, -10);
  
  const recentAvg = recent.reduce((sum, d) => sum + d.value, 0) / recent.length;
  const olderAvg = older.reduce((sum, d) => sum + d.value, 0) / older.length;
  
  const change = ((recentAvg - olderAvg) / olderAvg) * 100;
  
  return {
    trend: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
    percentage: Math.abs(change),
  };
}