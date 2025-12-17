import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { UserModel } from '../src/models/User';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootEnvPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: rootEnvPath, override: true });

const EMAIL = 'ree@g.com';

async function checkUser() {
  try {
    const mongoUri = process.env.MONGODB_URI 
      || process.env.MONGODB_URL
      || 'mongodb://localhost:27017/ai-kindle';

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const user = await UserModel.findOne({ email: EMAIL.toLowerCase() });
    
    if (user) {
      console.log('✅ User found:');
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Has Password: ${!!user.password}`);
      console.log(`   Password Length: ${user.password?.length || 0}`);
    } else {
      console.log('❌ User not found!');
      console.log(`   Email searched: ${EMAIL.toLowerCase()}`);
      console.log('\n💡 Run the migration script to create the user:');
      console.log('   npm run migrate:books-to-user');
    }

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkUser();

