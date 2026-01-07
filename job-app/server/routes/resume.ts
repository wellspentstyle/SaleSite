import { Router } from 'express';
import { query, queryOne } from '../db.js';

const router = Router();

// Get master resume
router.get('/', async (req, res) => {
  try {
    const resume = await queryOne(
      'SELECT id, content, updated_at FROM job_resume ORDER BY id LIMIT 1'
    );
    res.json(resume || { content: '', updated_at: null });
  } catch (error) {
    console.error('Error fetching resume:', error);
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

// Update master resume (upsert)
router.put('/', async (req, res) => {
  try {
    const { content } = req.body;

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Upsert: update if exists, insert if not
    const existing = await queryOne('SELECT id FROM job_resume LIMIT 1');

    let resume;
    if (existing) {
      resume = await queryOne(
        'UPDATE job_resume SET content = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [content, existing.id]
      );
    } else {
      resume = await queryOne(
        'INSERT INTO job_resume (content) VALUES ($1) RETURNING *',
        [content]
      );
    }

    res.json(resume);
  } catch (error) {
    console.error('Error updating resume:', error);
    res.status(500).json({ error: 'Failed to update resume' });
  }
});

export default router;
