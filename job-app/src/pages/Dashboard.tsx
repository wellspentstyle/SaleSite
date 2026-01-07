import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileText, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { StatusBadge } from '../components/ui/StatusBadge';
import { applicationsApi, Application } from '../lib/api';
import { formatRelativeDate } from '../lib/utils';

const statusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'ghosted', label: 'Ghosted' },
];

export function Dashboard() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadApplications();
  }, [statusFilter]);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const data = await applicationsApi.list(statusFilter);
      setApplications(data);
    } catch (err) {
      setError('Failed to load applications');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Job Applications</h1>
            <p className="text-gray-500 mt-1">Track and manage your job search</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/resume">
              <Button variant="secondary">
                <FileText className="w-4 h-4 mr-2" />
                Master Resume
              </Button>
            </Link>
            <Link to="/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Application
              </Button>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {applications.length} application{applications.length !== 1 ? 's' : ''}
              </span>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={statusOptions}
                className="w-40"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-600">{error}</div>
          ) : applications.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 mb-4">No applications yet</p>
              <Link to="/new">
                <Button>Create your first application</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {applications.map((app) => (
                <div
                  key={app.id}
                  onClick={() => navigate(`/application/${app.id}`)}
                  className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-gray-900 truncate">
                          {app.company_name || 'Untitled Company'}
                        </h3>
                        <StatusBadge status={app.status} />
                      </div>
                      <p className="text-sm text-gray-500 mt-1 truncate">
                        {app.role_title || 'No role specified'}
                      </p>
                    </div>
                    <div className="text-sm text-gray-400 ml-4">
                      {formatRelativeDate(app.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
