module.exports = {
    apps: [
        {
            name: "stateCluster",
            script: "./serverNode.js",
            instances: 1,
            exec_mode: "cluster",
            watch: true,
            increment_var: 'PORT',
            env: {
                "PORT": 9091,
                "NODE_ENV": "development", 
                "REDIS_PASS": "dX9qXT7BdaC61HcY1hMA+WtB698uxC7Y"
            }
        }
    ]
}