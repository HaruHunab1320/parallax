'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import {
  Users,
  RefreshCw,
  Plus,
  Shield,
  Mail,
  Key,
  Trash2,
  Edit,
  UserCheck,
  UserX,
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  name?: string;
  role: 'admin' | 'operator' | 'developer' | 'viewer';
  status: 'active' | 'inactive' | 'pending';
  ssoProvider?: string;
  lastLoginAt?: string;
  createdAt: string;
}

const ROLES = [
  { value: 'admin', label: 'Admin', description: 'Full access to all features' },
  { value: 'operator', label: 'Operator', description: 'Can execute patterns and manage schedules' },
  { value: 'developer', label: 'Developer', description: 'Can view and edit patterns' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access' },
];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [licenseType, setLicenseType] = useState<string>('opensource');

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'viewer' as User['role'],
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/users');
      if (response.status === 403) {
        // Feature not available
        setUsers([]);
        return;
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLicense = async () => {
    try {
      const response = await fetch('/api/license');
      const data = await response.json();
      setLicenseType(data.type || 'opensource');
    } catch (error) {
      setLicenseType('opensource');
    }
  };

  useEffect(() => {
    fetchLicense();
    fetchUsers();
  }, []);

  const handleCreate = async () => {
    try {
      setActionLoading('create');
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to create user');
      }

      setShowCreateModal(false);
      setFormData({ email: '', name: '', role: 'viewer' });
      fetchUsers();
    } catch (error) {
      console.error('Failed to create user:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateRole = async (userId: string, role: User['role']) => {
    try {
      setActionLoading(userId);
      await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      fetchUsers();
    } catch (error) {
      console.error('Failed to update user role:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    try {
      setActionLoading(userId);
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchUsers();
    } catch (error) {
      console.error('Failed to toggle user status:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      setActionLoading(userId);
      await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/20 text-red-400';
      case 'operator':
        return 'bg-blue-500/20 text-blue-400';
      case 'developer':
        return 'bg-green-500/20 text-green-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  // Show upgrade prompt for open source users
  if (licenseType === 'opensource') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Users</h1>
          <p className="text-gray-400 mt-1">Manage user access and permissions</p>
        </div>

        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Enterprise Feature</h3>
            <p className="text-gray-400 mb-4 max-w-md mx-auto">
              Multi-user access and RBAC are available in Parallax Enterprise.
              Upgrade to add team members with role-based permissions.
            </p>
            <Button asChild>
              <a href="https://parallax.ai/enterprise" target="_blank" rel="noopener noreferrer">
                Learn About Enterprise
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Users</h1>
          <p className="text-gray-400 mt-1">Manage user access and permissions</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={fetchUsers}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      {/* Users List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading users...</div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No users yet</h3>
            <p className="text-gray-400 mb-4">
              Add team members to collaborate on pattern management.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-white/10">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => setSelectedUser(user)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-parallax-accent/20 flex items-center justify-center">
                      <span className="text-parallax-accent font-medium">
                        {(user.name || user.email).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {user.name || user.email}
                      </p>
                      <p className="text-sm text-gray-400">{user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`px-2 py-1 text-xs rounded-md capitalize ${getRoleColor(user.role)}`}>
                      {user.role}
                    </span>

                    <div className="flex items-center gap-2">
                      {user.status === 'active' ? (
                        <UserCheck className="w-5 h-5 text-green-500" />
                      ) : (
                        <UserX className="w-5 h-5 text-gray-500" />
                      )}
                    </div>

                    {user.ssoProvider && (
                      <span className="px-2 py-1 text-xs bg-white/10 rounded-md text-gray-400">
                        SSO: {user.ssoProvider}
                      </span>
                    )}

                    <div className="text-right hidden md:block">
                      <p className="text-sm text-gray-400">Last Login</p>
                      <p className="text-sm text-white">
                        {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : 'Never'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Add User</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-400 mb-1 block">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-parallax-accent"
                    placeholder="user@example.com"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-400 mb-1 block">Name (optional)</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-parallax-accent"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-400 mb-1 block">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as User['role'] })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-parallax-accent"
                  >
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value} className="bg-gray-800">
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {ROLES.find((r) => r.value === formData.role)?.description}
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={!formData.email}>
                    {actionLoading === 'create' ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      'Add User'
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-parallax-accent/20 flex items-center justify-center">
                    <span className="text-parallax-accent font-bold text-lg">
                      {(selectedUser.name || selectedUser.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <CardTitle>{selectedUser.name || selectedUser.email}</CardTitle>
                    <p className="text-sm text-gray-400">{selectedUser.email}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedUser(null)}>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Role</p>
                    <p className="font-medium text-white capitalize">{selectedUser.role}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Status</p>
                    <p className="font-medium text-white capitalize">{selectedUser.status}</p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-400 mb-2 block">Change Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map((role) => (
                      <button
                        key={role.value}
                        onClick={() => handleUpdateRole(selectedUser.id, role.value as User['role'])}
                        disabled={actionLoading === selectedUser.id}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          selectedUser.role === role.value
                            ? 'border-parallax-accent bg-parallax-accent/10'
                            : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <p className="font-medium text-white">{role.label}</p>
                        <p className="text-xs text-gray-400">{role.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-white/10">
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(selectedUser.id)}
                    disabled={actionLoading === selectedUser.id}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete User
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => handleToggleStatus(selectedUser.id, selectedUser.status)}
                    disabled={actionLoading === selectedUser.id}
                  >
                    {selectedUser.status === 'active' ? (
                      <>
                        <UserX className="w-4 h-4 mr-2" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-4 h-4 mr-2" />
                        Activate
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
