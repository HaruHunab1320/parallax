import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'stable';
  };
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn('metric-card', className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-gray-400 mb-1">{title}</p>
            <p className="text-3xl font-bold text-white">{value}</p>
            {subtitle && (
              <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-2">
                {trend.direction === 'up' ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : trend.direction === 'down' ? (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                ) : (
                  <Minus className="w-4 h-4 text-gray-500" />
                )}
                <span
                  className={cn(
                    'text-sm font-medium',
                    trend.direction === 'up'
                      ? 'text-green-500'
                      : trend.direction === 'down'
                      ? 'text-red-500'
                      : 'text-gray-500'
                  )}
                >
                  {trend.direction === 'stable' ? '0' : trend.value}%
                </span>
              </div>
            )}
          </div>
          {icon && (
            <div className="w-12 h-12 rounded-lg bg-parallax-accent/20 flex items-center justify-center text-parallax-accent">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}