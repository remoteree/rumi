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
const TEST_PASSWORD = 'changeme123';

async function testPassword() {
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

    console.log('Testing password comparison...');
    console.log(`   Email: ${user.email}`);
    console.log(`   Test Password: ${TEST_PASSWORD}`);
    console.log(`   Stored Password Hash: ${user.password.substring(0, 20)}...`);
    
    const isMatch = await user.comparePassword(TEST_PASSWORD);
    console.log(`\n✅ Password Match: ${isMatch}`);
    
    if (!isMatch) {
      console.log('\n⚠️  Password does not match!');
      console.log('   The password in the database might be different.');
      console.log('   Try running the migration script again or reset the password.');
    }

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testPassword();

