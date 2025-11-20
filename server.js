const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trion-mini';

const userSchema = new mongoose.Schema({
  telegramId: { type: String, index: true, unique: true },
  first_name: String,
  username: String,
  photo_url: String,
  balance: { type: Number, default: 0 },
  lastSpinAt: { type: Date, default: null },
  lastDailyAt: { type: Date, default: null },
  subscribed: { type: Boolean, default: false },
  wallet: { type: String, default: null }
},{ timestamps:true });

const User = mongoose.model('User', userSchema);

async function main(){
  try{
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
  }catch(e){ console.error('Mongo connection error', e); }
}
main();

function hoursBetween(a,b){ if(!a||!b) return Infinity; return Math.abs(new Date(a).getTime()-new Date(b).getTime())/36e5; }

app.get('/', (req,res)=>res.send({ok:true,msg:'Trion backend'}));

app.post('/api/users/init', async (req,res)=>{
  const { telegramId, first_name, username, photo_url } = req.body;
  if(!telegramId) return res.json({ ok:false, error:'telegramId required' });
  let user = await User.findOne({ telegramId });
  if(!user){
    user = new User({ telegramId, first_name, username, photo_url, balance:0 });
    await user.save();
  } else {
    user.first_name = first_name || user.first_name;
    user.username = username || user.username;
    user.photo_url = photo_url || user.photo_url;
    await user.save();
  }
  res.json({ ok:true, user });
});

app.get('/api/users/:telegramId', async (req,res)=>{
  const user = await User.findOne({ telegramId: req.params.telegramId });
  if(!user) return res.json({ ok:false, error:'not found' });
  res.json({ ok:true, user });
});

app.post('/api/tap', async (req,res)=>{
  const { telegramId } = req.body;
  if(!telegramId) return res.json({ ok:false, error:'telegramId required' });
  const user = await User.findOneAndUpdate({ telegramId }, { $inc: { balance: 1 } }, { new: true });
  if(!user) return res.json({ ok:false, error:'user not found' });
  res.json({ ok:true, user });
});

app.post('/api/wheel/spin', async (req,res)=>{
  const { telegramId } = req.body;
  if(!telegramId) return res.json({ ok:false, error:'telegramId required' });
  const user = await User.findOne({ telegramId });
  if(!user) return res.json({ ok:false, error:'user not found' });
  const now = new Date();
  if(user.lastSpinAt && hoursBetween(user.lastSpinAt, now) < 6) return res.json({ ok:false, error:'Spin is available once per 6 hours' });
  const rewards = [1000,3000,5000,10000];
  const reward = rewards[Math.floor(Math.random()*rewards.length)];
  user.balance += reward;
  user.lastSpinAt = now;
  await user.save();
  res.json({ ok:true, reward, user });
});

app.post('/api/tasks/subscribe', async (req,res)=>{
  const { telegramId } = req.body;
  if(!telegramId) return res.json({ ok:false, error:'telegramId required' });
  const user = await User.findOne({ telegramId });
  if(!user) return res.json({ ok:false, error:'user not found' });
  if(user.subscribed) return res.json({ ok:false, error:'Already claimed' });
  user.subscribed = true;
  user.balance += 3000;
  await user.save();
  res.json({ ok:true, user });
});

app.post('/api/daily/claim', async (req,res)=>{
  const { telegramId } = req.body;
  if(!telegramId) return res.json({ ok:false, error:'telegramId required' });
  const user = await User.findOne({ telegramId });
  if(!user) return res.json({ ok:false, error:'user not found' });
  const now = new Date();
  if(user.lastDailyAt){ const last = new Date(user.lastDailyAt); if(last.toDateString()===now.toDateString()) return res.json({ ok:false, error:'Already claimed today' }); }
  user.balance += 1000;
  user.lastDailyAt = now;
  await user.save();
  res.json({ ok:true, user });
});

app.post('/api/users/wallet', async (req,res)=>{
  const { telegramId, wallet } = req.body;
  if(!telegramId || !wallet) return res.json({ ok:false, error:'Missing fields' });
  const user = await User.findOne({ telegramId });
  if(!user) return res.json({ ok:false, error:'User not found' });
  user.wallet = wallet;
  await user.save();
  res.json({ ok:true, user });
});

app.listen(PORT, ()=>console.log('Server listening on', PORT));
