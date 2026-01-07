import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { applicationsApi } from '../lib/api';

export function NewApplication() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    company_name: '',
    company_url: '',
    role_title: '',
    job_description: '',
    salary_range: '',
    notes: '',
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (generate: boolean) => {
    if (!formData.job_description.trim()) {
      setError('Job description is required');
      return;
    }

    try {
      setGenerating(generate);
      setError(null);

      const application = await applicationsApi.create({
        ...formData,
        generate,
      });

      navigate(`/application/${application.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create application');
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-xl font-semibold text-gray-900">New Application</h1>
            <p className="text-sm text-gray-500 mt-1">
              Paste a job description to generate tailored materials
            </p>
          </div>

          <div className="p-6 space-y-6">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Company Name"
                value={formData.company_name}
                onChange={(e) => handleChange('company_name', e.target.value)}
                placeholder="e.g., Acme Inc"
              />
              <Input
                label="Role Title"
                value={formData.role_title}
                onChange={(e) => handleChange('role_title', e.target.value)}
                placeholder="e.g., Senior Product Manager"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Company URL"
                value={formData.company_url}
                onChange={(e) => handleChange('company_url', e.target.value)}
                placeholder="https://..."
              />
              <Input
                label="Salary Range"
                value={formData.salary_range}
                onChange={(e) => handleChange('salary_range', e.target.value)}
                placeholder="e.g., $120k - $150k"
              />
            </div>

            <Textarea
              label="Job Description"
              value={formData.job_description}
              onChange={(e) => handleChange('job_description', e.target.value)}
              placeholder="Paste the full job description here..."
              className="min-h-[300px]"
            />

            <Textarea
              label="Notes (optional)"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Any additional context or notes..."
              className="min-h-[100px]"
            />

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <Button
                variant="secondary"
                onClick={() => handleSubmit(false)}
                disabled={generating}
              >
                Save Without Generating
              </Button>
              <Button onClick={() => handleSubmit(true)} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Materials
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
