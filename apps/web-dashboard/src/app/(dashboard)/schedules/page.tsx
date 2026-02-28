'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import {
  Clock,
  RefreshCw,
  Plus,
  Play,
  Pause,
  Trash2,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';

interface Schedule {
  id: string;
  name: string;
  patternName: string;
  description?: string;
  cronExpression?: string;
  intervalMs?: number;
  timezone: string;
  status: 'active' | 'paused' | 'completed';
  input?: any;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failure';
  runCount: number;
  maxRuns?: number;
  createdAt: string;
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    patternName: '',
    description: '',
    cron: '',
    intervalMs: '',
    timezone: 'UTC',
    input: '{}',
  });

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/schedules');
      const data = await response.json();
      setSchedules(data.schedules || []);
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
    const interval = setInterval(fetchSchedules, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async () => {
    try {
      setActionLoading('create');
      const body: any = {
        name: formData.name,
        patternName: formData.patternName,
        description: formData.description || undefined,
        timezone: formData.timezone,
        input: JSON.parse(formData.input || '{}'),
      };

      if (formData.cron) {
        body.cron = formData.cron;
      } else if (formData.intervalMs) {
        body.intervalMs = parseInt(formData.intervalMs, 10);
      }

      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Failed to create schedule');
      }

      setShowCreateModal(false);
      setFormData({
        name: '',
        patternName: '',
        description: '',
        cron: '',
        intervalMs: '',
        timezone: 'UTC',
        input: '{}',
      });
      fetchSchedules();
    } catch (error) {
      console.error('Failed to create schedule:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (id: string) => {
    try {
      setActionLoading(id);
      await fetch(`/api/schedules/${id}/pause`, { method: 'POST' });
      fetchSchedules();
    } catch (error) {
      console.error('Failed to pause schedule:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (id: string) => {
    try {
      setActionLoading(id);
      await fetch(`/api/schedules/${id}/resume`, { method: 'POST' });
      fetchSchedules();
    } catch (error) {
      console.error('Failed to resume schedule:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTrigger = async (id: string) => {
    try {
      setActionLoading(id);
      await fetch(`/api/schedules/${id}/trigger`, { method: 'POST' });
      fetchSchedules();
    } catch (error) {
      console.error('Failed to trigger schedule:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      setActionLoading(id);
      await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      setSelectedSchedule(null);
      fetchSchedules();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusIcon = (schedule: Schedule) => {
    if (schedule.status === 'paused') {
      return <Pause className="w-5 h-5 text-yellow-500" />;
    }
    if (schedule.status === 'completed') {
      return <CheckCircle className="w-5 h-5 text-gray-500" />;
    }
    if (schedule.lastRunStatus === 'failure') {
      return <AlertCircle className="w-5 h-5 text-orange-500" />;
    }
    return <CheckCircle className="w-5 h-5 text-green-500" />;
  };

  const getScheduleDescription = (schedule: Schedule) => {
    if (schedule.cronExpression) {
      return `Cron: ${schedule.cronExpression}`;
    }
    if (schedule.intervalMs) {
      const seconds = schedule.intervalMs / 1000;
      if (seconds >= 3600) {
        return `Every ${(seconds / 3600).toFixed(1)} hours`;
      }
      if (seconds >= 60) {
        return `Every ${(seconds / 60).toFixed(0)} minutes`;
      }
      return `Every ${seconds} seconds`;
    }
    return 'No schedule configured';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Schedules</h1>
          <p className="text-gray-400 mt-1">Manage scheduled pattern executions</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={fetchSchedules}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Schedule
          </Button>
        </div>
      </div>

      {/* Schedule Grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No schedules yet</h3>
            <p className="text-gray-400 mb-4">
              Create a schedule to automatically run patterns on a recurring basis.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Schedule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {schedules.map((schedule) => (
            <Card
              key={schedule.id}
              className="cursor-pointer hover:border-parallax-accent/50 transition-colors"
              onClick={() => setSelectedSchedule(schedule)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-parallax-accent/20 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-parallax-accent" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{schedule.name}</CardTitle>
                      <p className="text-sm text-gray-400">{schedule.patternName}</p>
                    </div>
                  </div>
                  {getStatusIcon(schedule)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-400">Schedule</p>
                    <p className="text-white">{getScheduleDescription(schedule)}</p>
                  </div>

                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm text-gray-400">Next Run</p>
                      <p className="text-white">
                        {schedule.nextRunAt
                          ? formatRelativeTime(schedule.nextRunAt)
                          : schedule.status === 'paused'
                          ? 'Paused'
                          : '-'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">Run Count</p>
                      <p className="text-white">
                        {schedule.runCount}
                        {schedule.maxRuns ? ` / ${schedule.maxRuns}` : ''}
                      </p>
                    </div>
                  </div>

                  {schedule.lastRunAt && (
                    <div className="flex items-center gap-2 text-sm">
                      {schedule.lastRunStatus === 'success' ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-gray-400">
                        Last run {formatRelativeTime(schedule.lastRunAt)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Create Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-400 mb-1 block">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-parallax-accent"
                    placeholder="Daily report"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-400 mb-1 block">Pattern Name</label>
                  <input
                    type="text"
                    value={formData.patternName}
                    onChange={(e) => setFormData({ ...formData, patternName: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-parallax-accent"
                    placeholder="voting-analysis"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-400 mb-1 block">
                    Cron Expression (or use interval below)
                  </label>
                  <input
                    type="text"
                    value={formData.cron}
                    onChange={(e) => setFormData({ ...formData, cron: e.target.value, intervalMs: '' })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-parallax-accent"
                    placeholder="0 9 * * *"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Example: "0 9 * * *" runs daily at 9 AM
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-400 mb-1 block">
                    Interval (milliseconds)
                  </label>
                  <input
                    type="number"
                    value={formData.intervalMs}
                    onChange={(e) => setFormData({ ...formData, intervalMs: e.target.value, cron: '' })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-parallax-accent"
                    placeholder="3600000"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Example: 3600000 = 1 hour
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-400 mb-1 block">
                    Input (JSON)
                  </label>
                  <textarea
                    value={formData.input}
                    onChange={(e) => setFormData({ ...formData, input: e.target.value })}
                    className="w-full h-24 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-parallax-accent"
                    placeholder='{"key": "value"}'
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!formData.name || !formData.patternName || (!formData.cron && !formData.intervalMs)}
                  >
                    {actionLoading === 'create' ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Schedule'
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Schedule Details Modal */}
      {selectedSchedule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{selectedSchedule.name}</CardTitle>
                  <p className="text-sm text-gray-400 mt-1">{selectedSchedule.patternName}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedSchedule(null)}>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Status</p>
                    <p className="font-medium text-white capitalize">{selectedSchedule.status}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Schedule</p>
                    <p className="font-medium text-white">{getScheduleDescription(selectedSchedule)}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Next Run</p>
                    <p className="font-medium text-white">
                      {selectedSchedule.nextRunAt
                        ? new Date(selectedSchedule.nextRunAt).toLocaleString()
                        : '-'}
                    </p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Run Count</p>
                    <p className="font-medium text-white">
                      {selectedSchedule.runCount}
                      {selectedSchedule.maxRuns ? ` / ${selectedSchedule.maxRuns}` : ''}
                    </p>
                  </div>
                </div>

                {selectedSchedule.description && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Description</h3>
                    <p className="text-white">{selectedSchedule.description}</p>
                  </div>
                )}

                {selectedSchedule.input && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Input</h3>
                    <pre className="text-sm bg-white/5 p-4 rounded-lg overflow-auto">
                      {JSON.stringify(selectedSchedule.input, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="flex justify-between pt-4">
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(selectedSchedule.id)}
                    disabled={actionLoading === selectedSchedule.id}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => handleTrigger(selectedSchedule.id)}
                      disabled={actionLoading === selectedSchedule.id}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Run Now
                    </Button>

                    {selectedSchedule.status === 'active' ? (
                      <Button
                        variant="outline"
                        onClick={() => handlePause(selectedSchedule.id)}
                        disabled={actionLoading === selectedSchedule.id}
                      >
                        <Pause className="w-4 h-4 mr-2" />
                        Pause
                      </Button>
                    ) : selectedSchedule.status === 'paused' ? (
                      <Button
                        onClick={() => handleResume(selectedSchedule.id)}
                        disabled={actionLoading === selectedSchedule.id}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Resume
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
