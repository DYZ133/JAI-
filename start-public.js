// 学生信息管理系统 - 公网部署启动脚本
// 用法：node start-public.js
// 自动启动服务器 + 获取公网隧道地址

const { spawn, execSync } = require('child_process');
const http = require('http');

console.log('========================================');
console.log('  学生信息管理系统 - 公网部署');
console.log('========================================\n');

// 1. 开放防火墙端口
console.log('[1/3] 尝试开放防火墙端口...');
try {
  execSync('netsh advfirewall firewall add rule name="StudentSystem-3456" dir=in action=allow protocol=TCP localport=3456', { stdio: 'pipe' });
  console.log('  [√] 防火墙端口 3456 已开放\n');
} catch (e) {
  console.log('  [!] 防火墙配置失败（可能需管理员权限），局域网访问可能受限\n');
}

// 2. 启动服务器
console.log('[2/3] 启动服务器...');
const server = spawn('node', ['server.js'], { stdio: 'pipe', detached: false });
server.stdout.on('data', data => { process.stdout.write('  ' + data); });
server.stderr.on('data', data => { console.error('  [错误]', data.toString()); });

// 等待服务器启动
setTimeout(() => {
  http.get('http://localhost:3456/login.html', (res) => {
    if (res.statusCode === 200) {
      console.log('  [√] 服务器已启动: http://localhost:3456\n');

      // 获取局域网地址
      const os = require('os');
      const nets = os.networkInterfaces();
      const ips = [];
      Object.keys(nets).forEach(k => {
        nets[k].forEach(a => {
          if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
        });
      });

      console.log('  📡 局域网地址（同WiFi下可用）：');
      ips.forEach(ip => console.log('     http://' + ip + ':3456'));

      console.log('\n[3/3] 正在获取公网隧道地址...\n');

      // 3. 启动 localtunnel
      try {
        const lt = require('localtunnel');
        lt({ port: 3456, local_host: '0.0.0.0' }).then(tunnel => {
          console.log('========================================');
          console.log('  🌐 公网地址（任何网络都可访问）');
          console.log('  ' + tunnel.url);
          console.log('========================================\n');
          console.log('分享这个链接给其他人即可访问查询系统！\n');
          console.log('按 Ctrl+C 停止服务\n');

          tunnel.on('close', () => {
            console.log('隧道连接已关闭');
            server.kill();
            process.exit(0);
          });
        }).catch(err => {
          console.log('  [!] 公网隧道启动失败: ' + err.message);
          console.log('  局域网地址仍可使用（需同一WiFi）\n');
          console.log('按 Ctrl+C 停止服务\n');
        });
      } catch (e) {
        console.log('  [!] localtunnel 模块未安装，请先运行: npm install -g localtunnel');
        console.log('  局域网地址仍可使用（需同一WiFi）\n');
        console.log('按 Ctrl+C 停止服务\n');
      }
    } else {
      console.log('  [!] 服务器启动异常');
    }
  }).on('error', () => {
    console.log('  [!] 无法连接到服务器，请检查端口是否被占用');
  });
}, 3000);

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n正在关闭...');
  server.kill();
  process.exit(0);
});
