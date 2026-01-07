import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { CopyButton } from '../components/ui/CopyButton';
import { applicationsApi, Application as ApplicationType } from '../lib/api';
import { formatDate } from '../lib/utils';

const statusOptions = [
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'ghosted', label: 'Ghosted' },
];

export function Application() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [application, setApplication] = useState<ApplicationType | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadApplication();
  }, [id]);

  const loadApplication = async () => {
    try {
      setLoading(true);
      const data = await applicationsApi.get(Number(id));
      setApplication(data);
      setNotes(data.notes || '');
    } catch (err) {
      setError('Failed to load application');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!application) return;
    try {
      const updated = await applicationsApi.update(application.id, {
        status: status as any,
        applied_at: status === 'applied' ? new Date().toISOString() : application.applied_at,
      });
      setApplication(updated);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleNotesBlur = async () => {
    if (!application || notes === application.notes) return;
    try {
      setSaving(true);
      await applicationsApi.update(application.id, { notes });
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!application) return;
    try {
      setGenerating(true);
      setError(null);
      const updated = await applicationsApi.generate(application.id);
      setApplication(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to generate materials');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!application || !confirm('Delete this application?')) return;
    try {
      await applicationsApi.delete(application.id);
      navigate('/');
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Application not found</p>
      </div>
    );
  }

  const hasGeneratedContent = application.tailored_resume || application.cover_letter;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-gray-900">
                    {application.company_name || 'Untitled Company'}
                  </h1>
                  {application.company_url && (
                    <a
                      href={application.company_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
                <p className="text-gray-500 mt-1">
                  {application.role_title || 'No role specified'}
                  {application.salary_range && ` · ${application.salary_range}`}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  Created {formatDate(application.created_at)}
                  {application.applied_at && ` · Applied ${formatDate(application.applied_at)}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Select
                  value={application.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  options={statusOptions}
                  className="w-36"
                />
                <Button
                  variant="secondary"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {hasGeneratedContent ? 'Regenerate' : 'Generate'}
                </Button>
                <Button variant="ghost" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          </div>

          {hasGeneratedContent ? (
            <Tabs defaultValue="resume" className="p-6">
              <TabsList className="mb-4">
                <TabsTrigger value="resume">Resume</TabsTrigger>
                <TabsTrigger value="cover">Cover Letter</TabsTrigger>
                <TabsTrigger value="interview">Interview Prep</TabsTrigger>
                <TabsTrigger value="jd">Job Description</TabsTrigger>
              </TabsList>

              <TabsContent value="resume">
                <div className="flex justify-end mb-2">
                  <CopyButton text={application.tailored_resume || ''} />
                </div>
                <div className="prose prose-sm max-w-none bg-gray-50 rounded-lg p-4 whitespace-pre-wrap font-mono text-sm">
                  {application.tailored_resume || 'No tailored resume generated yet.'}
                </div>
              </TabsContent>

              <TabsContent value="cover">
                <div className="flex justify-end mb-2">
                  <CopyButton text={application.cover_letter || ''} />
                </div>
                <div className="prose prose-sm max-w-none bg-gray-50 rounded-lg p-4 whitespace-pre-wrap">
                  {application.cover_letter || 'No cover letter generated yet.'}
                </div>
              </TabsContent>

              <TabsContent value="interview">
                <div className="space-y-4">
                  {application.interview_questions?.length ? (
                    application.interview_questions.map((q, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-4">
                        <h3 className="font-medium text-gray-900 mb-2">
                          {i + 1}. {q.question}
                        </h3>
                        <div className="space-y-2 text-sm">
                          <p>
                            <span className="font-medium text-gray-700">Why they're asking:</span>{' '}
                            <span className="text-gray-600">{q.why}</span>
                          </p>
                          <div>
                            <span className="font-medium text-gray-700">Talking points:</span>
                            <ul className="list-disc list-inside text-gray-600 mt-1">
                              {q.talkingPoints?.map((point, j) => (
                                <li key={j}>{point}</li>
                              ))}
                            </ul>
                          </div>
                          <p>
                            <span className="font-medium text-gray-700">Answer framework:</span>{' '}
                            <span className="text-gray-600">{q.framework}</span>
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">No interview questions generated yet.</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="jd">
                <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap text-sm text-gray-700">
                  {application.job_description}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="p-6">
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">
                  No materials generated yet. Click "Generate" to create tailored resume, cover letter, and interview prep.
                </p>
                <Button onClick={handleGenerate} disabled={generating}>
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

              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-medium text-gray-900 mb-2">Job Description</h3>
                <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap text-sm text-gray-700">
                  {application.job_description}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium text-gray-900">Notes</h2>
            {saving && <span className="text-xs text-gray-400">Saving...</span>}
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder="Track conversations, contacts, next steps..."
            className="min-h-[120px]"
          />
        </div>
      </div>
    </div>
  );
}
