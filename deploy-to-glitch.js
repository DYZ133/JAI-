// ============================================
// 学生信息管理系统 - 一键部署到 Glitch
// 运行：node deploy-to-glitch.js
// ============================================

const https = require('https');
const fs = require('fs');
const path = require('path');

const EMAIL = '1746788300@qq.com';
const PASSWORD = '634650000Dyz';
const BASE_DIR = __dirname;

// 封装 HTTPS 请求
function api(method, hostname, path, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (extraHeaders) Object.assign(headers, extraHeaders);
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request({ hostname, path, method, headers }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, headers: res.headers, body: d }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

// 要上传的项目文件（data.json 不传，让服务器自动生成种子演示数据，避免上传真实学生隐私）
const filesToUpload = [
  'server.js',
  'package.json',
  '.gitignore',
  'public/login.html',
  'public/student.html',
  'public/index.html',
  'public/query.html',
  'public/share.html',
];

async function deploy() {
  console.log('========================================');
  console.log('  学生信息管理系统 - Glitch 一键部署');
  console.log('========================================\n');

  // Step 1: 注册 / 登录 Glitch
  console.log('[1/5] 登录 Glitch...');
  let authToken;
  let userId;

  // 先尝试登录
  try {
    const loginRes = await api('POST', 'api.glitch.com', '/auth/login', {
      email: EMAIL,
      password: PASSWORD
    });
    if (loginRes.body && loginRes.body.token) {
      authToken = loginRes.body.token;
      userId = loginRes.body.userId;
      console.log('  [√] 登录成功\n');
    } else if (loginRes.body && loginRes.body.message) {
      console.log('  [!]', loginRes.body.message);
    }
  } catch (e) {
    console.log('  [!] 登录请求失败:', e.message);
  }

  // 如果登录失败，尝试注册
  if (!authToken) {
    console.log('  尝试注册新账号...');
    try {
      const signupRes = await api('POST', 'api.glitch.com', '/auth/signup', {
        email: EMAIL,
        password: PASSWORD,
        login: EMAIL.split('@')[0]
      });
      if (signupRes.body && signupRes.body.token) {
        authToken = signupRes.body.token;
        userId = signupRes.body.userId;
        console.log('  [√] 注册成功\n');
      } else {
        console.log('  [!] 注册返回:', JSON.stringify(signupRes.body).substring(0, 300));
        console.log('\n可能需要验证邮箱。请检查 ' + EMAIL + ' 的收件箱，点击 Glitch 发来的验证链接。');
        console.log('验证完成后，重新运行此脚本即可。\n');
        process.exit(1);
      }
    } catch (e) {
      console.log('  [!] 注册请求失败:', e.message);
      process.exit(1);
    }
  }

  const authHeaders = { 'Authorization': 'Bearer ' + authToken };

  // Step 2: 创建项目
  console.log('[2/5] 创建 Glitch 项目...');
  let projectId, projectDomain;
  try {
    const projectRes = await api('POST', 'api.glitch.com', '/v1/projects', {
      name: 'student-system',
      template: 'hello-express'
    }, authHeaders);
    if (projectRes.body && projectRes.body.id) {
      projectId = projectRes.body.id;
      projectDomain = projectRes.body.domain;
      console.log('  [√] 项目已创建: https://' + projectDomain + '\n');
    } else {
      console.log('  [!] 创建项目返回:', JSON.stringify(projectRes.body).substring(0, 300));
      process.exit(1);
    }
  } catch (e) {
    console.log('  [!] 创建项目失败:', e.message);
    process.exit(1);
  }

  // Step 3: 获取项目的 otp token（写文件需要）
  console.log('[3/5] 获取文件写入权限...');
  let otpToken;
  try {
    const otpRes = await api('GET', 'api.glitch.com', '/v1/projects/' + projectId + '/otp', null, authHeaders);
    if (otpRes.body && otpRes.body.token) {
      otpToken = otpRes.body.token;
      console.log('  [√] 获取成功\n');
    } else {
      console.log('  [!] OTP 返回:', JSON.stringify(otpRes.body).substring(0, 200));
      process.exit(1);
    }
  } catch (e) {
    console.log('  [!] OTP 失败:', e.message);
    process.exit(1);
  }

  // Step 4: 上传文件
  console.log('[4/5] 上传项目文件...');
  for (const filePath of filesToUpload) {
    const fullPath = path.join(BASE_DIR, filePath);
    if (!fs.existsSync(fullPath)) {
      console.log('  [跳过] ' + filePath + ' (文件不存在)');
      continue;
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    try {
      const uploadRes = await api('POST', 'api.glitch.com', '/v1/projects/' + projectId + '/files', {
        path: filePath,
        content: content
      }, { ...authHeaders, 'X-OTP-Token': otpToken });

      if (uploadRes.status === 200 || uploadRes.status === 201) {
        console.log('  [√] ' + filePath);
      } else {
        console.log('  [!] ' + filePath + ' -', uploadRes.status, JSON.stringify(uploadRes.body).substring(0, 100));
      }
    } catch (e) {
      console.log('  [!] ' + filePath + ' -', e.message);
    }
  }

  // Step 5: 完成
  console.log('\n[5/5] 部署完成！\n');
  console.log('========================================');
  console.log('  🌐 你的永久公网地址：');
  console.log('  https://' + projectDomain);
  console.log('========================================\n');
  console.log('登录页: https://' + projectDomain + '/login.html');
  console.log('教师账号: admin / admin123');
  console.log('学生账号: 学号 / 123456\n');
  console.log('这个网址 24/7 在线，关机也不影响！\n');

  // 保存部署信息
  const deployInfo = {
    url: 'https://' + projectDomain,
    projectId: projectId,
    deployedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(BASE_DIR, '.deploy-info.json'), JSON.stringify(deployInfo, null, 2));
  console.log('部署信息已保存到 .deploy-info.json\n');
}

deploy().catch((e) => {
  console.log('\n部署失败:', e.message);
  console.log('请检查网络连接后重试。');
  process.exit(1);
});
