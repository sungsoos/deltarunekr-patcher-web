module.exports = {
    name: "deltarunekr_patcher_web",
    script: "server.js",
    interpreter: "bun",
    env: {
        PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`
    }
};