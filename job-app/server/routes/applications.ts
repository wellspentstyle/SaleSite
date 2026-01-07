import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { generateMaterials } from '../services/ai.js';

const router = Router();

// List all applications
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;

    let sql = 'SELECT * FROM job_applications ORDER BY created_at DESC';
    let params: any[] = [];

    if (status && status !== 'all') {
      sql = 'SELECT * FROM job_applications WHERE status = $1 ORDER BY created_at DESC';
      params = [status];
    }

    const applications = await query(sql, params);
    res.json(applications);
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Get single application
router.get('/:id', async (req, res) => {
  try {
    const application = await queryOne(
      'SELECT * FROM job_applications WHERE id = $1',
      [req.params.id]
    );

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(application);
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

// Create new application
router.post('/', async (req, res) => {
  try {
    const {
      company_name,
      company_url,
      role_title,
      job_description,
      notes,
      salary_range,
      generate = false
    } = req.body;

    if (!job_description) {
      return res.status(400).json({ error: 'Job description is required' });
    }

    // Create the application first
    let application = await queryOne(
      `INSERT INTO job_applications (company_name, company_url, role_title, job_description, notes, salary_range)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [company_name, company_url, role_title, job_description, notes, salary_range]
    );

    // Generate materials if requested
    if (generate) {
      const resume = await queryOne('SELECT content FROM job_resume LIMIT 1');

      if (resume?.content) {
        const materials = await generateMaterials(resume.content, job_description, company_name);

        application = await queryOne(
          `UPDATE job_applications
           SET tailored_resume = $1, cover_letter = $2, interview_questions = $3, updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [materials.tailoredResume, materials.coverLetter, JSON.stringify(materials.interviewQuestions), application.id]
        );
      }
    }

    res.status(201).json(application);
  } catch (error) {
    console.error('Error creating application:', error);
    res.status(500).json({ error: 'Failed to create application' });
  }
});

// Update application
router.put('/:id', async (req, res) => {
  try {
    const {
      company_name,
      company_url,
      role_title,
      job_description,
      tailored_resume,
      cover_letter,
      interview_questions,
      status,
      notes,
      salary_range,
      applied_at
    } = req.body;

    const application = await queryOne(
      `UPDATE job_applications
       SET company_name = COALESCE($1, company_name),
           company_url = COALESCE($2, company_url),
           role_title = COALESCE($3, role_title),
           job_description = COALESCE($4, job_description),
           tailored_resume = COALESCE($5, tailored_resume),
           cover_letter = COALESCE($6, cover_letter),
           interview_questions = COALESCE($7, interview_questions),
           status = COALESCE($8, status),
           notes = COALESCE($9, notes),
           salary_range = COALESCE($10, salary_range),
           applied_at = COALESCE($11, applied_at),
           updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [company_name, company_url, role_title, job_description, tailored_resume, cover_letter,
       interview_questions ? JSON.stringify(interview_questions) : null, status, notes, salary_range, applied_at, req.params.id]
    );

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(application);
  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// Delete application
router.delete('/:id', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM job_applications WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (!result) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

// Generate materials for existing application
router.post('/:id/generate', async (req, res) => {
  try {
    const application = await queryOne(
      'SELECT * FROM job_applications WHERE id = $1',
      [req.params.id]
    );

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const resume = await queryOne('SELECT content FROM job_resume LIMIT 1');

    if (!resume?.content) {
      return res.status(400).json({ error: 'No master resume found. Please add your resume first.' });
    }

    const materials = await generateMaterials(
      resume.content,
      application.job_description,
      application.company_name
    );

    const updated = await queryOne(
      `UPDATE job_applications
       SET tailored_resume = $1, cover_letter = $2, interview_questions = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [materials.tailoredResume, materials.coverLetter, JSON.stringify(materials.interviewQuestions), req.params.id]
    );

    res.json(updated);
  } catch (error) {
    console.error('Error generating materials:', error);
    res.status(500).json({ error: 'Failed to generate materials' });
  }
});

export default router;
