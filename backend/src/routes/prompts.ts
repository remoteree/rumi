import express from 'express';
import { PromptVersionModel } from '../models/PromptVersion.js';
import { generatePromptsForCombo, getAllPromptVersions } from '../services/promptGenerator.js';
import { BookType, Niche } from '@ai-kindle/shared';

const router = express.Router();

// Get all prompt versions for a book type + niche combo
router.get('/:bookType/:niche', async (req, res) => {
  try {
    const { bookType, niche } = req.params;
    const prompts = await getAllPromptVersions(bookType as BookType, niche as Niche);
    res.json({ success: true, data: prompts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate prompts for a combo (admin only)
router.post('/generate/:bookType/:niche', async (req, res) => {
  try {
    const { bookType, niche } = req.params;
    const { writingStyle } = req.body; // Optional writing style from request body
    const prompts = await generatePromptsForCombo(bookType as BookType, niche as Niche, writingStyle);
    res.json({ success: true, data: prompts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a specific prompt version
router.put('/:id', async (req, res) => {
  try {
    const { prompt, variables } = req.body;
    const updated = await PromptVersionModel.findByIdAndUpdate(
      req.params.id,
      {
        prompt,
        variables,
        'metadata.updatedAt': new Date()
      },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Create a new version of a prompt
router.post('/:id/version', async (req, res) => {
  try {
    const original = await PromptVersionModel.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    // Get latest version
    const latest = await PromptVersionModel.findOne({
      bookType: original.bookType,
      niche: original.niche,
      promptType: original.promptType
    }).sort({ version: -1 });

    const newVersion = new PromptVersionModel({
      bookType: original.bookType,
      niche: original.niche,
      promptType: original.promptType,
      version: (latest?.version || 0) + 1,
      prompt: req.body.prompt || original.prompt,
      variables: req.body.variables || original.variables
    });

    await newVersion.save();
    res.json({ success: true, data: newVersion });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;






