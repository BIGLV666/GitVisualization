package org.example.gitvisualization.controller;

import io.github.biglv666.webcommon.result.Result;
import lombok.RequiredArgsConstructor;
import org.example.gitvisualization.services.abstracts.GitAbstract;
import org.example.gitvisualization.vo.CommitNode;
import org.example.gitvisualization.vo.GitStatusVo;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Git 操作接口（提交图、分支、暂存/提交、储藏、配置、推送）。
 */
@RestController
@RequestMapping("/git")
@RequiredArgsConstructor
public class GitController {

    private final GitAbstract gitService;

    /**
     * 获取指定仓库的提交图（最近 limit 条提交，默认 200，最大 1000）。
     */
    @GetMapping("/{warehouseId}/commits")
    public Result<List<CommitNode>> getCommits(@PathVariable Long warehouseId,
                                               @RequestParam(defaultValue = "200") int limit) {
        return Result.ok(gitService.getCommits(warehouseId, limit));
    }

    /**
     * 获取工作区状态（git status）。
     */
    @GetMapping("/{warehouseId}/status")
    public Result<GitStatusVo> getStatus(@PathVariable Long warehouseId) {
        return Result.ok(gitService.getStatus(warehouseId));
    }

    /**
     * 获取指定文件的差异（unified diff 文本）。
     */
    @GetMapping("/{warehouseId}/diff")
    public Result<String> diff(@PathVariable Long warehouseId, @RequestParam("path") String path) {
        return Result.ok(gitService.diff(warehouseId, path));
    }

    /**
     * 切换分支。
     */
    @PostMapping("/{warehouseId}/switch")
    public Result<Void> switchCommit(@PathVariable Long warehouseId, @RequestParam("branch") String branch) {
        gitService.switchCommit(warehouseId, branch);
        return Result.ok();
    }

    /**
     * 新建分支（git checkout -b）。
     */
    @PostMapping("/{warehouseId}/branch")
    public Result<Void> createBranch(@PathVariable Long warehouseId, @RequestParam("name") String name) {
        gitService.createBranch(warehouseId, name);
        return Result.ok();
    }

    /**
     * 暂存文件（git add）。请求体为文件路径数组，为空则暂存全部。
     */
    @PostMapping("/{warehouseId}/stage")
    public Result<Void> stage(@PathVariable Long warehouseId, @RequestBody(required = false) List<String> paths) {
        gitService.stage(warehouseId, paths);
        return Result.ok();
    }

    /**
     * 取消暂存（git reset）。请求体为文件路径数组，为空则取消全部。
     */
    @PostMapping("/{warehouseId}/unstage")
    public Result<Void> unstage(@PathVariable Long warehouseId, @RequestBody(required = false) List<String> paths) {
        gitService.unstage(warehouseId, paths);
        return Result.ok();
    }

    /**
     * 提交已暂存的变更（git commit）。
     */
    @PostMapping("/{warehouseId}/commit")
    public Result<Void> commit(@PathVariable Long warehouseId, @RequestParam("message") String message) {
        gitService.commit(warehouseId, message);
        return Result.ok();
    }

    /**
     * 储藏当前修改（git stash）。
     */
    @PostMapping("/{warehouseId}/stash")
    public Result<Void> stash(@PathVariable Long warehouseId) {
        gitService.stash(warehouseId);
        return Result.ok();
    }

    /**
     * 恢复最近一次储藏（git stash pop）。
     */
    @PostMapping("/{warehouseId}/stash/pop")
    public Result<Void> stashPop(@PathVariable Long warehouseId) {
        gitService.stashPop(warehouseId);
        return Result.ok();
    }

    /**
     * 合并分支：将源分支合并到当前 HEAD 所在分支。
     */
    @PostMapping("/{warehouseId}/merge")
    public Result<Void> mergeBranch(@PathVariable Long warehouseId, @RequestParam("branch") String branch) {
        gitService.mergeBranch(warehouseId, branch);
        return Result.ok();
    }

    /**
     * 配置仓库的 user.name / user.email。
     */
    @PostMapping("/{warehouseId}/config")
    public Result<Void> config(@PathVariable Long warehouseId,
                               @RequestParam(value = "username", required = false) String username,
                               @RequestParam(value = "email", required = false) String email) {
        gitService.config(warehouseId, username, email);
        return Result.ok();
    }

    /**
     * 推送到仓库登记的远程地址。
     */
    @PostMapping("/{warehouseId}/push")
    public Result<Void> push(@PathVariable Long warehouseId) {
        gitService.push(warehouseId);
        return Result.ok();
    }
}
