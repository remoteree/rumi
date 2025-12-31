import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { UserModel } from '../src/models/User';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootEnvPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: rootEnvPath, override: true });

const EMAIL = 'ree@g.com';
const NEW_PASSWORD = 'changeme123';

async function resetPassword() {
  try {
    const mongoUri = process.env.MONGODB_URI 
      || process.env.MONGODB_URL
      || 'mongodb://localhost:27017/ai-kindle';

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const user = await UserModel.findOne({ email: EMAIL.toLowerCase() });
    
    if (!user) {
      console.log('❌ User not found!');
      await mongoose.disconnect();
      return;
    }

    console.log(`🔄 Resetting password for ${EMAIL}...`);
    
    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, salt);
    
    // Update password directly (bypassing the pre-save hook to avoid double hashing)
    await UserModel.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword } }
    );

    console.log('✅ Password reset successfully!');
    console.log(`\n📧 Email: ${EMAIL}`);
    console.log(`🔑 Password: ${NEW_PASSWORD}`);
    console.log(`⚠️  Please change the password after first login!`);

    // Verify the password works
    const updatedUser = await UserModel.findById(user._id);
    if (updatedUser) {
      const isMatch = await updatedUser.comparePassword(NEW_PASSWORD);
      console.log(`\n✅ Password verification: ${isMatch ? 'PASSED' : 'FAILED'}`);
    }

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetPassword();



