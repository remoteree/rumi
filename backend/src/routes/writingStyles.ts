import express from 'express';
import { WritingStyleModel } from '../models/WritingStyle';

const router = express.Router();

// Get all writing styles
router.get('/', async (req, res) => {
  try {
    const styles = await WritingStyleModel.find().sort({ name: 1 });
    res.json({ success: true, data: styles });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get a specific writing style by ID
router.get('/:id', async (req, res) => {
  try {
    const style = await WritingStyleModel.findById(req.params.id);
    if (!style) {
      return res.status(404).json({ success: false, error: 'Writing style not found' });
    }
    res.json({ success: true, data: style });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new writing style
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({ success: false, error: 'Name and description are required' });
    }

    // Check if a style with this name already exists
    const existing = await WritingStyleModel.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ success: false, error: 'A writing style with this name already exists' });
    }

    const style = new WritingStyleModel({
      name: name.trim(),
      description: description.trim()
    });

    await style.save();
    res.json({ success: true, data: style });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'A writing style with this name already exists' });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// Update a writing style
router.put('/:id', async (req, res) => {
  try {
    const { name, description } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();

    // If updating name, check for duplicates
    if (name) {
      const existing = await WritingStyleModel.findOne({ 
        name: name.trim(), 
        _id: { $ne: req.params.id } 
      });
      if (existing) {
        return res.status(400).json({ success: false, error: 'A writing style with this name already exists' });
      }
    }

    const style = await WritingStyleModel.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!style) {
      return res.status(404).json({ success: false, error: 'Writing style not found' });
    }

    res.json({ success: true, data: style });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'A writing style with this name already exists' });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// Delete a writing style
router.delete('/:id', async (req, res) => {
  try {
    const style = await WritingStyleModel.findByIdAndDelete(req.params.id);
    if (!style) {
      return res.status(404).json({ success: false, error: 'Writing style not found' });
    }
    res.json({ success: true, message: 'Writing style deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

