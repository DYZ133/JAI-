const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ========== JWT 无状态令牌（解决 Vercel 多实例 session 不共享问题）==========
const JWT_SECRET = process.env.JWT_SECRET || 'student-system-jwt-secret-2026-key';
const JWT_EXPIRES = 7 * 24 * 60 * 60; // 7天

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function createToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + signature;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(parts[0] + '.' + parts[1]).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(parts[2]))) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch(e) {
    return null;
  }
}

const https = require('https');

// ========== GitHub 自动同步（解决 Vercel 冷启动数据丢失问题）==========
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = 'DYZ133/JAI-';
const GITHUB_FILE_PATH = 'data.json';  // GitHub 仓库根目录（注意：不是 student-system 子目录）

function githubApi(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: urlPath,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + GITHUB_TOKEN,
        'User-Agent': 'student-system',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    if (bodyStr) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error('GitHub API error: ' + (json.message || res.statusCode)));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// 同步备份到 GitHub（在响应前执行，确保数据持久化）
// 使用子进程 curl 而非 setTimeout，因为 Vercel serverless 会在响应后冻结进程
function syncToGitHubSync(dbData) {
  if (!IS_VERCEL || !GITHUB_TOKEN) return;
  const DB_JSON = JSON.stringify(dbData, null, 2);
  try {
    // 第一步：获取当前文件 SHA
    const getResult = require('child_process').execSync(
      'curl -sf -H "Authorization: Bearer ' + GITHUB_TOKEN + '" -H "User-Agent: student-system" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + GITHUB_FILE_PATH + '"',
      { timeout: 5000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const current = JSON.parse(getResult);
    if (!current.sha) { console.error('[Sync] 无法获取 SHA'); return; }

    // 第二步：更新文件
    const content = Buffer.from(DB_JSON).toString('base64');
    const putBody = JSON.stringify({
      message: 'auto-sync [' + new Date().toISOString().replace('T', ' ').substring(0, 19) + ']',
      content: content,
      sha: current.sha
    });
    const tmpFile = '/tmp/sync_payload_' + Date.now() + '.json';
    fs.writeFileSync(tmpFile, putBody);
    require('child_process').execSync(
      'curl -sf -X PUT -H "Authorization: Bearer ' + GITHUB_TOKEN + '" -H "User-Agent: student-system" -H "Content-Type: application/json" -d @' + tmpFile + ' "https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + GITHUB_FILE_PATH + '"',
      { timeout: 5000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    try { fs.unlinkSync(tmpFile); } catch(e) {}
    lastGithubCheck = Date.now();
  } catch(e) {
    console.error('[Sync] 备份失败:', e.message);
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/lib', express.static(path.join(__dirname, 'public', 'lib')));

// Vercel serverless 环境用 /tmp 目录（可读写但重启丢失），本地用 __dirname
const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = IS_VERCEL ? '/tmp' : __dirname;
const SEED_FILE = path.join(__dirname, 'data.json');     // 初始种子数据（随部署打包）
const DB_FILE = path.join(DATA_DIR, 'data.json');        // 运行时数据文件

// ========== 数据存储（GitHub 作为多实例共享数据源）==========
let cacheVersion = 0;       // 当前缓存版本号
let lastGithubCheck = 0;    // 上次检查 GitHub 的时间戳
const GITHUB_CHECK_INTERVAL = 5000;  // 5 秒内不重复检查 GitHub

// 从 GitHub 同步拉取最新数据（解决 Vercel 多实例数据不同步问题）
function fetchLatestFromGitHub() {
  if (!GITHUB_TOKEN) return null;
  try {
    const url = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + GITHUB_FILE_PATH;
    const result = require('child_process').execSync(
      'curl -sf -H "Authorization: Bearer ' + GITHUB_TOKEN + '" -H "User-Agent: student-system" -H "Accept: application/vnd.github.v3+json" "' + url + '"',
      { timeout: 8000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const json = JSON.parse(result);
    if (json.content && json.sha) {
      // 检查 SHA 是否变化（避免重复解析大文件）
      if (cacheVersion === 0 || String(json.sha) !== String(cacheVersion)) {
        const data = Buffer.from(json.content, 'base64').toString('utf-8');
        fs.writeFileSync(DB_FILE, data);
        cacheVersion = json.sha;
        console.log('[Load] 从 GitHub 更新数据，SHA:', String(json.sha).substring(0, 8));
        return JSON.parse(data);
      }
      // SHA 未变，标记已检查
      cacheVersion = json.sha;
    }
  } catch(e) {
    console.error('[Load] GitHub 同步失败:', e.message);
  }
  return null;
}

function load() {
  // Vercel 环境且有 GitHub Token：检查是否需要从 GitHub 同步
  if (IS_VERCEL && GITHUB_TOKEN) {
    const now = Date.now();
    // 每 5 秒最多检查一次 GitHub，避免重复请求
    if (now - lastGithubCheck > GITHUB_CHECK_INTERVAL || !fs.existsSync(DB_FILE)) {
      lastGithubCheck = now;
      const latest = fetchLatestFromGitHub();
      if (latest) return latest;
    }
  }

  // /tmp/data.json 不存在：冷启动
  if (!fs.existsSync(DB_FILE)) {
    if (IS_VERCEL) {
      // 尝试从 GitHub 拉取
      const latest = fetchLatestFromGitHub();
      if (latest) return latest;
      // GitHub 拉取失败，回退到部署包中的种子文件
      if (fs.existsSync(SEED_FILE)) {
        fs.copyFileSync(SEED_FILE, DB_FILE);
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      }
    }
    // 本地开发或首次启动：创建空数据库
    const init = {
      students: [],
      grades: [],
      dormitories: [],
      assignments: [],
      classes: [],
      courses: [],
      users: [],
      nextId: { student: 1, grade: 1, dormitory: 1, assignment: 1, class: 1, course: 1, user: 1 }
    };
    seed(init);
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  // 数据迁移：确保新字段存在
  let migrated = false;
  if (!db.users) { db.users = []; migrated = true; }
  if (!db.nextId.user) { db.nextId.user = db.users.length + 1; migrated = true; }
  if (db.users.length === 0) {
    db.users.push({
      userId: nextId(db, 'user'),
      username: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      role: 'teacher',
      displayName: '管理员',
      createTime: now()
    });
    // 为已有学生创建账号
    db.students.forEach(s => {
      if (!db.users.find(u => u.username === s.studentNo)) {
        db.users.push({
          userId: nextId(db, 'user'),
          username: s.studentNo,
          password: bcrypt.hashSync('123456', 10),
          role: 'student',
          displayName: s.studentName,
          studentId: s.studentId,
          createTime: now()
        });
      }
    });
    migrated = true;
  }
  if (migrated) { save(db); }
  return db;
}

function save(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  lastGithubCheck = Date.now();  // 写入后本实例数据最新，不需要立即检查 GitHub
  syncToGitHubSync(db);  // 同步备份到 GitHub（必须在响应前执行，Vercel 响应后会冻结进程）
}

function nextId(db, key) {
  return db.nextId[key]++;
}

function now() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function seed(db) {
  const c1 = nextId(db, 'class');
  const c2 = nextId(db, 'class');
  const c3 = nextId(db, 'class');
  db.classes.push(
    { classId: c1, className: '软件工程2401班', grade: '2024级', major: '软件工程', department: '计算机学院', classTeacher: '张老师', studentCount: 0, status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' },
    { classId: c2, className: '软件工程2402班', grade: '2024级', major: '软件工程', department: '计算机学院', classTeacher: '李老师', studentCount: 0, status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' },
    { classId: c3, className: '计算机科学2401班', grade: '2024级', major: '计算机科学与技术', department: '计算机学院', classTeacher: '王老师', studentCount: 0, status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' }
  );

  for (let i = 1; i <= 6; i++) {
    const id = nextId(db, 'dormitory');
    const buildings = ['北苑1号楼', '北苑1号楼', '北苑1号楼', '北苑1号楼', '南苑1号楼', '南苑1号楼'];
    const floors = [1, 1, 1, 2, 1, 1];
    const rooms = ['101', '102', '103', '201', '101', '102'];
    const beds = [4, 4, 4, 4, 6, 6];
    const types = ['四人间', '四人间', '四人间', '四人间', '六人间', '六人间'];
    const fees = [800, 800, 800, 800, 600, 600];
    const balconies = ['1', '1', '1', '1', '0', '0'];
    const washrooms = ['1', '1', '1', '1', '0', '0'];
    db.dormitories.push({
      dormitoryId: id, buildingName: buildings[i-1], floor: floors[i-1], roomNo: rooms[i-1],
      bedCount: beds[i-1], occupiedCount: 0, roomType: types[i-1], hasBalcony: balconies[i-1],
      hasAircon: '1', hasWashroom: washrooms[i-1], monthlyFee: fees[i-1], status: '0',
      createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: ''
    });
  }

  const courseData = [
    ['MATH101', '高等数学（上）', 5.0, '必修', '张教授', '2024-2025-1', 80, '考试'],
    ['ENG101', '大学英语（一）', 4.0, '必修', '李教授', '2024-2025-1', 64, '考试'],
    ['CS101', '程序设计基础', 4.0, '必修', '王教授', '2024-2025-1', 64, '考试'],
    ['CS201', '数据结构', 4.0, '必修', '赵教授', '2024-2025-2', 64, '考试'],
    ['CS202', '数据库原理', 3.0, '必修', '孙教授', '2024-2025-2', 48, '考试'],
    ['GEN101', '大学生心理健康', 2.0, '公选', '陈老师', '2024-2025-1', 32, '考查'],
  ];
  courseData.forEach(c => {
    const id = nextId(db, 'course');
    db.courses.push({ courseId: id, courseCode: c[0], courseName: c[1], credit: c[2], courseType: c[3], teacher: c[4], semester: c[5], classHour: c[6], examType: c[7], status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' });
  });

  // 示例学生
  const s1 = nextId(db, 'student');
  const s2 = nextId(db, 'student');
  const s3 = nextId(db, 'student');
  db.students.push(
    { studentId: s1, studentNo: '2024001', studentName: '张三', gender: '0', birthDate: '2006-03-15', idCard: '', phone: '13800138001', email: 'zhangsan@example.com', nativePlace: '江苏省南京市', nation: '汉族', politicalStatus: '共青团员', classId: c1, className: '软件工程2401班', enrollmentDate: '2024-09-01', graduationDate: '2028-07-01', status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' },
    { studentId: s2, studentNo: '2024002', studentName: '李四', gender: '1', birthDate: '2005-08-22', idCard: '', phone: '13800138002', email: 'lisi@example.com', nativePlace: '浙江省杭州市', nation: '汉族', politicalStatus: '共青团员', classId: c1, className: '软件工程2401班', enrollmentDate: '2024-09-01', graduationDate: '2028-07-01', status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' },
    { studentId: s3, studentNo: '2024003', studentName: '王五', gender: '0', birthDate: '2006-01-10', idCard: '', phone: '13800138003', email: 'wangwu@example.com', nativePlace: '上海市', nation: '汉族', politicalStatus: '群众', classId: c2, className: '软件工程2402班', enrollmentDate: '2024-09-01', graduationDate: '2028-07-01', status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' }
  );

  // 示例住宿
  db.assignments.push(
    { assignmentId: nextId(db, 'assignment'), studentId: s1, studentName: '张三', studentNo: '2024001', dormitoryId: 1, buildingName: '北苑1号楼', roomNo: '101', bedNo: 'A床', checkInDate: '2024-09-01', checkOutDate: '', isCurrent: '1', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' },
    { assignmentId: nextId(db, 'assignment'), studentId: s2, studentName: '李四', studentNo: '2024002', dormitoryId: 1, buildingName: '北苑1号楼', roomNo: '101', bedNo: 'B床', checkInDate: '2024-09-01', checkOutDate: '', isCurrent: '1', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' }
  );
  db.dormitories[0].occupiedCount = 2;

  // 示例成绩
  const grades = [
    [s1, 1, 92.5], [s1, 2, 85], [s1, 3, 78],
    [s2, 1, 88], [s2, 3, 95], [s3, 1, 60]
  ];
  grades.forEach(g => {
    const score = g[2];
    let level, point;
    if (score >= 90) { level = '优秀'; point = 4.0; }
    else if (score >= 80) { level = '良好'; point = 3.0; }
    else if (score >= 70) { level = '中等'; point = 2.0; }
    else if (score >= 60) { level = '及格'; point = 1.0; }
    else { level = '不及格'; point = 0.0; }
    db.grades.push({
      gradeId: nextId(db, 'grade'), studentId: g[0], studentName: db.students.find(s => s.studentId === g[0]).studentName,
      studentNo: db.students.find(s => s.studentId === g[0]).studentNo,
      courseId: g[1], courseName: db.courses.find(c => c.courseId === g[1]).courseName,
      score, gradePoint: point, gradeLevel: level, semester: '2024-2025-1', examType: '期末',
      makeupScore: null, isPassed: score >= 60 ? '1' : '0',
      createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: ''
    });
  });
}

// ========== 认证辅助 ==========
function createStudentUser(db, studentNo, studentName, studentId) {
  if (db.users.find(u => u.username === studentNo)) return;
  const hash = bcrypt.hashSync('123456', 10);
  db.users.push({
    userId: nextId(db, 'user'),
    username: studentNo,
    password: hash,
    role: 'student',
    displayName: studentName,
    studentId: studentId,
    createTime: now()
  });
}

// ========== Auth 中间件（JWT 验证，无需 session 存储）==========
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, msg: '未登录，请先登录' });
  }
  const token = header.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ code: 401, msg: '登录已过期，请重新登录' });
  }
  req.user = payload;
  req.token = token;
  next();
}

function requireTeacher(req, res, next) {
  if (!req.user) return res.status(401).json({ code: 401, msg: '未登录' });
  if (req.user.role !== 'teacher') return res.status(403).json({ code: 403, msg: '无权限，仅教师可操作' });
  next();
}

// ========== 分页辅助 ==========
function paginate(list, pageNum = 1, pageSize = 10) {
  const total = list.length;
  const start = (pageNum - 1) * pageSize;
  return { rows: list.slice(start, start + pageSize), total };
}

// ============ 学生 API ============
app.get('/api/student/info/list', auth, requireTeacher, (req, res) => {
  const db = load();
  let list = [...db.students];
  const { studentNo, studentName, gender, classId, status } = req.query;
  if (studentNo) list = list.filter(s => s.studentNo.includes(studentNo));
  if (studentName) list = list.filter(s => s.studentName.includes(studentName));
  if (gender) list = list.filter(s => s.gender === gender);
  if (classId) list = list.filter(s => s.classId == classId);
  if (status) list = list.filter(s => s.status === status);
  list.sort((a, b) => b.studentId - a.studentId);
  // 关联班级名
  list.forEach(s => { if (!s.className && s.classId) { const c = db.classes.find(x => x.classId == s.classId); s.className = c ? c.className : ''; } });
  res.json(paginate(list, parseInt(req.query.pageNum) || 1, parseInt(req.query.pageSize) || 10));
});

app.get('/api/student/info/all', auth, requireTeacher, (req, res) => {
  const db = load();
  res.json({ data: db.students.filter(s => s.status === '0') });
});

app.get('/api/student/info/:id', auth, (req, res) => {
  const db = load();
  const s = db.students.find(x => x.studentId == req.params.id);
  if (s && s.classId) { const c = db.classes.find(x => x.classId == s.classId); s.className = c ? c.className : ''; }
  res.json({ data: s || null });
});

app.post('/api/student/info', auth, requireTeacher, (req, res) => {
  const db = load();
  const exist = db.students.find(s => s.studentNo === req.body.studentNo);
  if (exist) return res.json({ code: 500, msg: '学号已存在' });
  const id = nextId(db, 'student');
  const c = db.classes.find(x => x.classId == req.body.classId);
  const s = { ...req.body, studentId: id, className: c ? c.className : '', createTime: now(), updateTime: '' };
  db.students.push(s);
  if (c) { c.studentCount = (c.studentCount || 0) + 1; }
  createStudentUser(db, s.studentNo, s.studentName, id);
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.put('/api/student/info', auth, requireTeacher, (req, res) => {
  const db = load();
  const idx = db.students.findIndex(x => x.studentId == req.body.studentId);
  if (idx === -1) return res.json({ code: 500, msg: '学生不存在' });
  const exist = db.students.find(s => s.studentNo === req.body.studentNo && s.studentId != req.body.studentId);
  if (exist) return res.json({ code: 500, msg: '学号已存在' });
  const c = db.classes.find(x => x.classId == req.body.classId);
  db.students[idx] = { ...db.students[idx], ...req.body, className: c ? c.className : '', updateTime: now() };
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.delete('/api/student/info/:ids', auth, requireTeacher, (req, res) => {
  const db = load();
  const ids = req.params.ids.split(',').map(Number);
  db.students = db.students.filter(s => !ids.includes(s.studentId));
  db.grades = db.grades.filter(g => !ids.includes(g.studentId));
  db.assignments = db.assignments.filter(a => !ids.includes(a.studentId));
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ============ 成绩 API ============
app.get('/api/student/grade/list', auth, requireTeacher, (req, res) => {
  const db = load();
  let list = [...db.grades];
  const { studentNo, studentName, studentId, courseId, semester, examType, isPassed } = req.query;
  if (studentNo) list = list.filter(g => g.studentNo && g.studentNo.includes(studentNo));
  if (studentName) list = list.filter(g => g.studentName && g.studentName.includes(studentName));
  if (studentId) list = list.filter(g => g.studentId == studentId);
  if (courseId) list = list.filter(g => g.courseId == courseId);
  if (semester) list = list.filter(g => g.semester === semester);
  if (examType) list = list.filter(g => g.examType === examType);
  if (isPassed) list = list.filter(g => g.isPassed === isPassed);
  list.sort((a, b) => b.gradeId - a.gradeId);
  res.json(paginate(list, parseInt(req.query.pageNum) || 1, parseInt(req.query.pageSize) || 10));
});

app.get('/api/student/grade/student/:studentId', (req, res) => {
  const db = load();
  res.json({ data: db.grades.filter(g => g.studentId == req.params.studentId) });
});

app.get('/api/student/grade/:id', (req, res) => {
  const db = load();
  res.json({ data: db.grades.find(x => x.gradeId == req.params.id) || null });
});

function calcGrade(score) {
  if (score >= 90) return { gradeLevel: '优秀', gradePoint: 4.0 };
  if (score >= 80) return { gradeLevel: '良好', gradePoint: 3.0 };
  if (score >= 70) return { gradeLevel: '中等', gradePoint: 2.0 };
  if (score >= 60) return { gradeLevel: '及格', gradePoint: 1.0 };
  return { gradeLevel: '不及格', gradePoint: 0.0 };
}

app.post('/api/student/grade', auth, requireTeacher, (req, res) => {
  const db = load();
  const id = nextId(db, 'grade');
  const student = db.students.find(s => s.studentId == req.body.studentId);
  const course = db.courses.find(c => c.courseId == req.body.courseId);
  const { gradeLevel, gradePoint } = calcGrade(req.body.score || 0);
  const g = {
    ...req.body, gradeId: id,
    studentName: student ? student.studentName : '',
    studentNo: student ? student.studentNo : '',
    courseName: course ? course.courseName : '',
    gradeLevel, gradePoint,
    isPassed: (req.body.score || 0) >= 60 ? '1' : '0',
    createTime: now(), updateTime: ''
  };
  db.grades.push(g);
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.put('/api/student/grade', auth, requireTeacher, (req, res) => {
  const db = load();
  const idx = db.grades.findIndex(x => x.gradeId == req.body.gradeId);
  if (idx === -1) return res.json({ code: 500, msg: '成绩不存在' });
  const { gradeLevel, gradePoint } = calcGrade(req.body.score || 0);
  db.grades[idx] = { ...db.grades[idx], ...req.body, gradeLevel, gradePoint, isPassed: (req.body.score || 0) >= 60 ? '1' : '0', updateTime: now() };
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.delete('/api/student/grade/:ids', auth, requireTeacher, (req, res) => {
  const db = load();
  const ids = req.params.ids.split(',').map(Number);
  db.grades = db.grades.filter(g => !ids.includes(g.gradeId));
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ============ 宿舍 API ============
app.get('/api/student/dormitory/list', auth, requireTeacher, (req, res) => {
  const db = load();
  let list = [...db.dormitories];
  const { buildingName, roomType, status } = req.query;
  if (buildingName) list = list.filter(d => d.buildingName.includes(buildingName));
  if (roomType) list = list.filter(d => d.roomType === roomType);
  if (status) list = list.filter(d => d.status === status);
  list.sort((a, b) => a.buildingName.localeCompare(b.buildingName) || a.floor - b.floor || a.roomNo.localeCompare(b.roomNo));
  res.json(paginate(list, parseInt(req.query.pageNum) || 1, parseInt(req.query.pageSize) || 10));
});

app.get('/api/student/dormitory/available', (req, res) => {
  const db = load();
  res.json({ data: db.dormitories.filter(d => d.status === '0' && d.occupiedCount < d.bedCount) });
});

app.get('/api/student/dormitory/:id', (req, res) => {
  const db = load();
  res.json({ data: db.dormitories.find(x => x.dormitoryId == req.params.id) || null });
});

app.post('/api/student/dormitory', auth, requireTeacher, (req, res) => {
  const db = load();
  const id = nextId(db, 'dormitory');
  db.dormitories.push({ ...req.body, dormitoryId: id, occupiedCount: 0, createTime: now(), updateTime: '' });
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.put('/api/student/dormitory', auth, requireTeacher, (req, res) => {
  const db = load();
  const idx = db.dormitories.findIndex(x => x.dormitoryId == req.body.dormitoryId);
  if (idx === -1) return res.json({ code: 500, msg: '宿舍不存在' });
  db.dormitories[idx] = { ...db.dormitories[idx], ...req.body, updateTime: now() };
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.delete('/api/student/dormitory/:ids', auth, requireTeacher, (req, res) => {
  const db = load();
  const ids = req.params.ids.split(',').map(Number);
  db.dormitories = db.dormitories.filter(d => !ids.includes(d.dormitoryId));
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ============ 住宿分配 API ============
app.get('/api/student/dormitory/assignment/list', auth, requireTeacher, (req, res) => {
  const db = load();
  let list = [...db.assignments];
  list.sort((a, b) => b.assignmentId - a.assignmentId);
  res.json(paginate(list, parseInt(req.query.pageNum) || 1, parseInt(req.query.pageSize) || 10));
});

app.get('/api/student/dormitory/assignment/student/:studentId', (req, res) => {
  const db = load();
  res.json({ data: db.assignments.find(a => a.studentId == req.params.studentId && a.isCurrent === '1') || null });
});

app.get('/api/student/dormitory/assignment/:id', (req, res) => {
  const db = load();
  res.json({ data: db.assignments.find(x => x.assignmentId == req.params.id) || null });
});

app.post('/api/student/dormitory/assignment', auth, requireTeacher, (req, res) => {
  const db = load();
  const dorm = db.dormitories.find(d => d.dormitoryId == req.body.dormitoryId);
  if (!dorm) return res.json({ code: 500, msg: '宿舍不存在' });
  if (dorm.occupiedCount >= dorm.bedCount) return res.json({ code: 500, msg: '该宿舍已满，无法分配' });
  const current = db.assignments.find(a => a.studentId == req.body.studentId && a.isCurrent === '1');
  if (current) return res.json({ code: 500, msg: '该学生已分配宿舍，请先退宿' });
  const id = nextId(db, 'assignment');
  const student = db.students.find(s => s.studentId == req.body.studentId);
  db.assignments.push({
    ...req.body, assignmentId: id, isCurrent: '1',
    studentName: student ? student.studentName : '',
    studentNo: student ? student.studentNo : '',
    buildingName: dorm.buildingName, roomNo: dorm.roomNo,
    checkInDate: req.body.checkInDate || new Date().toISOString().substring(0, 10),
    createTime: now(), updateTime: ''
  });
  dorm.occupiedCount++;
  if (dorm.occupiedCount >= dorm.bedCount) dorm.status = '2';
  save(db);
  res.json({ code: 200, msg: '分配成功' });
});

app.put('/api/student/dormitory/assignment', auth, requireTeacher, (req, res) => {
  const db = load();
  const idx = db.assignments.findIndex(x => x.assignmentId == req.body.assignmentId);
  if (idx === -1) return res.json({ code: 500, msg: '记录不存在' });
  db.assignments[idx] = { ...db.assignments[idx], ...req.body, updateTime: now() };
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.put('/api/student/dormitory/assignment/checkout/:id', auth, requireTeacher, (req, res) => {
  const db = load();
  const a = db.assignments.find(x => x.assignmentId == req.params.id);
  if (!a || a.isCurrent !== '1') return res.json({ code: 500, msg: '该记录不存在或已退宿' });
  a.isCurrent = '0';
  a.checkOutDate = new Date().toISOString().substring(0, 10);
  a.updateTime = now();
  const dorm = db.dormitories.find(d => d.dormitoryId == a.dormitoryId);
  if (dorm) {
    dorm.occupiedCount = Math.max(0, dorm.occupiedCount - 1);
    if (dorm.status === '2') dorm.status = '0';
  }
  save(db);
  res.json({ code: 200, msg: '退宿成功' });
});

app.delete('/api/student/dormitory/assignment/:ids', auth, requireTeacher, (req, res) => {
  const db = load();
  const ids = req.params.ids.split(',').map(Number);
  db.assignments = db.assignments.filter(a => !ids.includes(a.assignmentId));
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ============ 班级 API ============
app.get('/api/student/class/list', auth, requireTeacher, (req, res) => {
  const db = load();
  let list = [...db.classes];
  const { className, major, department } = req.query;
  if (className) list = list.filter(c => c.className.includes(className));
  if (major) list = list.filter(c => c.major.includes(major));
  if (department) list = list.filter(c => c.department.includes(department));
  res.json(paginate(list, parseInt(req.query.pageNum) || 1, parseInt(req.query.pageSize) || 10));
});

app.get('/api/student/class/all', (req, res) => {
  const db = load();
  res.json({ data: db.classes.filter(c => c.status === '0') });
});

app.get('/api/student/class/:id', (req, res) => {
  const db = load();
  res.json({ data: db.classes.find(x => x.classId == req.params.id) || null });
});

app.post('/api/student/class', auth, requireTeacher, (req, res) => {
  const db = load();
  if (db.classes.find(c => c.className === req.body.className)) return res.json({ code: 500, msg: '班级名称已存在' });
  const id = nextId(db, 'class');
  db.classes.push({ ...req.body, classId: id, createTime: now(), updateTime: '' });
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.put('/api/student/class', auth, requireTeacher, (req, res) => {
  const db = load();
  const idx = db.classes.findIndex(x => x.classId == req.body.classId);
  if (idx === -1) return res.json({ code: 500, msg: '班级不存在' });
  const dup = db.classes.find(c => c.className === req.body.className && c.classId != req.body.classId);
  if (dup) return res.json({ code: 500, msg: '班级名称已存在' });
  db.classes[idx] = { ...db.classes[idx], ...req.body, updateTime: now() };
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.delete('/api/student/class/:ids', auth, requireTeacher, (req, res) => {
  const db = load();
  const ids = req.params.ids.split(',').map(Number);
  db.classes = db.classes.filter(c => !ids.includes(c.classId));
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ============ 课程 API ============
app.get('/api/student/course/list', auth, requireTeacher, (req, res) => {
  const db = load();
  let list = [...db.courses];
  const { courseName, courseType, teacher } = req.query;
  if (courseName) list = list.filter(c => c.courseName.includes(courseName));
  if (courseType) list = list.filter(c => c.courseType === courseType);
  if (teacher) list = list.filter(c => c.teacher.includes(teacher));
  res.json(paginate(list, parseInt(req.query.pageNum) || 1, parseInt(req.query.pageSize) || 10));
});

app.get('/api/student/course/all', (req, res) => {
  const db = load();
  res.json({ data: db.courses.filter(c => c.status === '0') });
});

app.get('/api/student/course/:id', (req, res) => {
  const db = load();
  res.json({ data: db.courses.find(x => x.courseId == req.params.id) || null });
});

app.post('/api/student/course', auth, requireTeacher, (req, res) => {
  const db = load();
  if (db.courses.find(c => c.courseCode === req.body.courseCode)) return res.json({ code: 500, msg: '课程编码已存在' });
  const id = nextId(db, 'course');
  db.courses.push({ ...req.body, courseId: id, createTime: now(), updateTime: '' });
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.put('/api/student/course', auth, requireTeacher, (req, res) => {
  const db = load();
  const idx = db.courses.findIndex(x => x.courseId == req.body.courseId);
  if (idx === -1) return res.json({ code: 500, msg: '课程不存在' });
  const dup = db.courses.find(c => c.courseCode === req.body.courseCode && c.courseId != req.body.courseId);
  if (dup) return res.json({ code: 500, msg: '课程编码已存在' });
  db.courses[idx] = { ...db.courses[idx], ...req.body, updateTime: now() };
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.delete('/api/student/course/:ids', auth, requireTeacher, (req, res) => {
  const db = load();
  const ids = req.params.ids.split(',').map(Number);
  db.courses = db.courses.filter(c => !ids.includes(c.courseId));
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ============ 仪表盘统计 ============
// 同步状态检查
app.get('/api/dashboard/sync-status', auth, (req, res) => {
  res.json({
    githubTokenSet: !!GITHUB_TOKEN,
    isVercel: IS_VERCEL,
    syncEnabled: !!(IS_VERCEL && GITHUB_TOKEN)
  });
});

app.get('/api/dashboard/stats', auth, (req, res) => {
  const db = load();
  res.json({
    studentCount: db.students.filter(s => s.status === '0').length,
    classCount: db.classes.filter(c => c.status === '0').length,
    dormitoryCount: db.dormitories.length,
    courseCount: db.courses.filter(c => c.status === '0').length,
    availableBeds: db.dormitories.reduce((sum, d) => sum + Math.max(0, d.bedCount - d.occupiedCount), 0),
    passRate: db.grades.length > 0 ? (db.grades.filter(g => g.isPassed === '1').length / db.grades.length * 100).toFixed(1) : 0
  });
});

// ============ 认证 API ============
// 登录
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ code: 500, msg: '请输入用户名和密码' });
  const db = load();
  const user = db.users.find(u => u.username === username);
  if (!user) return res.json({ code: 500, msg: '用户名或密码错误' });
  if (!bcrypt.compareSync(password, user.password)) return res.json({ code: 500, msg: '用户名或密码错误' });
  // 生成 JWT（无状态，服务器端不存 session）
  const token = createToken({
    userId: user.userId,
    username: user.username,
    role: user.role,
    displayName: user.displayName,
    studentId: user.studentId || null,
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRES
  });
  res.json({
    code: 200,
    msg: '登录成功',
    data: {
      token,
      user: { userId: user.userId, username: user.username, role: user.role, displayName: user.displayName, studentId: user.studentId || null }
    }
  });
});

// 登出（JWT 只需客户端清除 token）
app.post('/api/auth/logout', auth, (req, res) => {
  res.json({ code: 200, msg: '已退出登录' });
});

// 获取当前用户
app.get('/api/auth/me', auth, (req, res) => {
  res.json({ code: 200, data: req.user });
});

// 修改密码
app.put('/api/auth/change-password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.json({ code: 500, msg: '请填写完整' });
  if (newPassword.length < 4) return res.json({ code: 500, msg: '新密码至少4位' });
  const db = load();
  const user = db.users.find(u => u.userId === req.user.userId);
  if (!user) return res.json({ code: 500, msg: '用户不存在' });
  if (!bcrypt.compareSync(oldPassword, user.password)) return res.json({ code: 500, msg: '旧密码错误' });
  user.password = bcrypt.hashSync(newPassword, 10);
  user.updateTime = now();
  save(db);
  // JWT 无状态，旧 token 仍然有效直到过期，提醒用户用新密码重新登录
  res.json({ code: 200, msg: '密码修改成功，请重新登录' });
});

// ============ 学生自查 API ============
app.get('/api/student/self/profile', auth, (req, res) => {
  if (req.user.role !== 'student') return res.json({ code: 403, msg: '仅学生可访问' });
  const db = load();
  const student = db.students.find(s => s.studentId === req.user.studentId);
  if (!student) return res.json({ code: 404, msg: '未找到学生信息' });
  res.json({ code: 200, data: student });
});

app.get('/api/student/self/grades', auth, (req, res) => {
  if (req.user.role !== 'student') return res.json({ code: 403, msg: '仅学生可访问' });
  const db = load();
  const grades = db.grades.filter(g => g.studentId === req.user.studentId).sort((a, b) => b.gradeId - a.gradeId);
  res.json({ code: 200, data: grades });
});

app.get('/api/student/self/dormitory', auth, (req, res) => {
  if (req.user.role !== 'student') return res.json({ code: 403, msg: '仅学生可访问' });
  const db = load();
  const assignment = db.assignments.find(a => a.studentId === req.user.studentId && a.isCurrent === '1');
  res.json({ code: 200, data: assignment || null });
});

// ============ 数据导出/导入 API ============
app.get('/api/data/export', auth, requireTeacher, (req, res) => {
  const db = load();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=data-backup.json');
  res.json(db);
});

app.post('/api/data/import', auth, requireTeacher, (req, res) => {
  try {
    const newData = req.body;
    // 基本校验
    if (!newData.students || !newData.grades || !newData.dormitories || !newData.assignments || !newData.classes || !newData.courses) {
      return res.json({ code: 500, msg: '数据格式不正确，缺少必要的字段' });
    }
    save(newData);
    res.json({ code: 200, msg: '数据导入成功' });
  } catch (e) {
    res.json({ code: 500, msg: '导入失败：' + e.message });
  }
});

// ============ 公开查询/分享路由 ============
app.get('/q', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'query.html'));
});

app.get('/s/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// 公开搜索 API：只返回在读学生的基本信息
app.get('/api/public/search', (req, res) => {
  const db = load();
  let list = db.students.filter(s => s.status === '0');
  const { q } = req.query;
  if (q) {
    const keyword = q.trim();
    list = list.filter(s =>
      s.studentNo.includes(keyword) ||
      s.studentName.includes(keyword) ||
      (s.phone && s.phone.includes(keyword))
    );
  }
  list.sort((a, b) => b.studentId - a.studentId);
  res.json({
    rows: list.slice(0, 20).map(s => ({
      studentId: s.studentId,
      studentNo: s.studentNo,
      studentName: s.studentName,
      gender: s.gender,
      className: s.className,
      phone: s.phone,
      enrollmentDate: s.enrollmentDate,
      status: s.status
    })),
    total: list.length
  });
});

// 公开学生详情 API：含成绩和住宿信息
app.get('/api/public/student/:id', (req, res) => {
  const db = load();
  const student = db.students.find(s => s.studentId == req.params.id && s.status === '0');
  if (!student) return res.json({ code: 404, msg: '学生不存在或已离校' });
  if (student.classId) {
    const c = db.classes.find(x => x.classId == student.classId);
    student.className = c ? c.className : student.className || '';
  }
  const grades = db.grades
    .filter(g => g.studentId == req.params.id)
    .sort((a, b) => b.gradeId - a.gradeId);
  const assignment = db.assignments.find(a => a.studentId == req.params.id && a.isCurrent === '1');
  res.json({
    code: 200,
    data: {
      student,
      grades,
      assignment: assignment || null
    }
  });
});

const PORT = process.env.PORT || 3456;

// 导出 app 供 Vercel serverless 使用
module.exports = app;

// 只在非 Vercel 环境（本地开发）启动监听
if (!IS_VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`  学生信息管理系统已启动！`);
    console.log(`  本地访问: http://localhost:${PORT}`);
    console.log(`========================================`);
  });
}
