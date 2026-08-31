package org.example.gitvisualization.services.abstracts;

import org.example.gitvisualization.vo.CommitNode;
import org.example.gitvisualization.vo.GitStatusVo;

import java.util.List;

/**
 * Git 仓库操作契约（提交图、分支、暂存/提交、储藏、推送）。
 */
public interface GitAbstract {

    /**
     * 获取指定仓库的提交图（最近 limit 条提交，避免大仓库全量遍历）。
     *
     * @param id    仓库主键
     * @param limit 最多返回的提交数
     */
    List<CommitNode> getCommits(Long id, int limit);

    /**
     * 切换分支。
     */
    void switchCommit(Long id, String targetBranch);

    /**
     * 新建分支：从当前 HEAD 创建并切换过去（git checkout -b）。
     */
    void createBranch(Long id, String branchName);

    /**
     * 读取工作区状态（git status）。
     */
    GitStatusVo getStatus(Long id);

    /**
     * 读取指定文件的差异（unified diff 文本，含已暂存/未暂存改动）。
     */
    String diff(Long id, String path);

    /**
     * 暂存文件（git add）。paths 为空时暂存全部。
     */
    void stage(Long id, List<String> paths);

    /**
     * 取消暂存（git reset）。paths 为空时取消全部暂存。
     */
    void unstage(Long id, List<String> paths);

    /**
     * 提交已暂存的变更（git commit）。
     */
    void commit(Long id, String message);

    /**
     * 储藏当前修改（git stash，整体暂存，不支持按路径）。
     */
    void stash(Long id);

    /**
     * 恢复最近一次储藏（git stash pop）。
     */
    void stashPop(Long id);

    /**
     * 合并分支：将指定源分支合并到当前 HEAD 所在分支。
     */
    void mergeBranch(Long id, String sourceBranch);

    /**
     * 配置仓库的 user.name / user.email。
     */
    void config(Long id, String username, String email);

    /**
     * 推送到仓库登记的远程地址（warehouse.remote_url）。
     */
    void push(Long id);
}
