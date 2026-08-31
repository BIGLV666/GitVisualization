package org.example.gitvisualization.services;

import io.github.biglv666.webcommon.exception.BusinessException;
import io.github.biglv666.webcommon.result.ResultCode;
import lombok.extern.slf4j.Slf4j;

import org.eclipse.jgit.api.AddCommand;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.MergeResult;
import org.eclipse.jgit.api.ResetCommand;
import org.eclipse.jgit.api.Status;
import org.eclipse.jgit.api.errors.*;
import org.eclipse.jgit.lib.Constants;
import org.eclipse.jgit.lib.ObjectId;
import org.eclipse.jgit.lib.ObjectReader;
import org.eclipse.jgit.lib.Ref;
import org.eclipse.jgit.lib.Repository;
import org.eclipse.jgit.lib.StoredConfig;
import org.eclipse.jgit.revwalk.RevCommit;
import org.eclipse.jgit.revwalk.RevWalk;
import org.eclipse.jgit.storage.file.FileRepositoryBuilder;
import org.eclipse.jgit.diff.DiffFormatter;
import org.eclipse.jgit.treewalk.AbstractTreeIterator;
import org.eclipse.jgit.treewalk.CanonicalTreeParser;
import org.eclipse.jgit.treewalk.EmptyTreeIterator;
import org.eclipse.jgit.treewalk.FileTreeIterator;
import org.eclipse.jgit.treewalk.filter.PathFilter;
import org.example.gitvisualization.entity.Warehouse;
import org.example.gitvisualization.enums.CodeEnum;
import org.example.gitvisualization.mapper.WarehouseMapper;
import org.example.gitvisualization.vo.CommitNode;
import org.example.gitvisualization.vo.GitStatusVo;
import org.example.gitvisualization.services.abstracts.GitAbstract;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Git 仓库操作业务服务。
 * <p>
 * 提供提交图遍历、分支（新建/切换/合并）、暂存/提交、储藏、配置、推送等常用 Git 操作。
 */
@Service
@Slf4j
public class GitService implements GitAbstract {

    /** 仓库数据访问层，负责按 id 查询仓库路径。 */
    @Autowired
    private WarehouseMapper warehouseMapper;

    /**
     * 遍历本地 Git 仓库的所有分支，返回提交图数据（节点列表 + 分支泳道）。
     */
    @Override
    public List<CommitNode> getCommits(Long id) {
        try (Repository repo = openRepository(id)) {
            List<CommitNode> nodes = new ArrayList<>();
            Map<String, CommitNode> nodeMap = new HashMap<>();

            String headId = null;
            Ref headRef = repo.exactRef(Constants.HEAD);
            if (headRef != null && headRef.getTarget() != null) {
                ObjectId headTarget = repo.resolve(Constants.HEAD);
                headId = headTarget != null ? headTarget.name() : null;
            }

            try (Git git = new Git(repo)) {
                List<Ref> branches = git.branchList().call();
                sortBranches(branches);

                List<RevCommit> branchTips = new ArrayList<>();
                try (RevWalk walk = new RevWalk(repo)) {
                    for (Ref branch : branches) {
                        RevCommit tip = walk.parseCommit(branch.getObjectId());
                        walk.markStart(tip);
                        branchTips.add(tip);
                    }
                    for (RevCommit commit : walk) {
                        CommitNode node = nodeMap.get(commit.name());
                        if (node == null) {
                            node = new CommitNode();
                            node.setId(commit.abbreviate(7).name());
                            node.setFullId(commit.name());
                            node.setTitle(commit.getShortMessage());
                            node.setFullMessage(commit.getFullMessage());
                            node.setAuthor(commit.getAuthorIdent().getName());
                            node.setTime((long) commit.getCommitTime() * 1000);
                            node.setParentIds(new ArrayList<>());
                            nodeMap.put(commit.name(), node);
                            nodes.add(node);
                        }
                        node.setIsHead(commit.name().equals(headId));
                        for (RevCommit parent : commit.getParents()) {
                            if (!node.getParentIds().contains(parent.name())) {
                                node.getParentIds().add(parent.name());
                            }
                        }
                    }
                }

                assignLanes(nodes, branches, branchTips);
            }
            return nodes;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "遍历仓库失败");
        }
    }

    /**
     * 切换分支：将仓库 checkout 到指定分支。
     */
    @Override
    public void switchCommit(Long id, String targetBranch) {
        try (Repository repo = openRepository(id)) {
            try (Git git = new Git(repo)) {
                git.checkout()
                        .setName(targetBranch)
                        .setCreateBranch(false)
                        .call();
            }
        } catch (CheckoutConflictException e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "切换失败：存在未提交的修改冲突");
        } catch (Exception e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "切换失败");
        }
    }

    /**
     * 新建分支：从当前 HEAD 创建并切换过去（git checkout -b）。
     */
    @Override
    public void createBranch(Long id, String branchName) {
        if (!StringUtils.hasText(branchName)) {
            throw new BusinessException(ResultCode.PARAM_ERROR, "分支名不能为空");
        }
        try (Repository repo = openRepository(id)) {
            try (Git git = new Git(repo)) {
                git.checkout()
                        .setCreateBranch(true)
                        .setName(branchName)
                        .call();
            }
        } catch (RefAlreadyExistsException e) {
            throw new BusinessException(ResultCode.CONFLICT, "分支已存在");
        } catch (Exception e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "新建分支失败");
        }
    }

    /**
     * 读取工作区状态（git status）。
     */
    @Override
    public GitStatusVo getStatus(Long id) {
        try (Repository repo = openRepository(id)) {
            try (Git git = new Git(repo)) {
                Status s = git.status().call();
                GitStatusVo vo = new GitStatusVo();
                List<String> staged = new ArrayList<>();
                staged.addAll(s.getAdded());
                staged.addAll(s.getChanged());
                staged.addAll(s.getRemoved());
                vo.setStaged(staged);
                vo.setModified(new ArrayList<>(s.getModified()));
                vo.setRemoved(new ArrayList<>(s.getMissing()));
                vo.setUntracked(new ArrayList<>(s.getUntracked()));
                vo.setClean(s.isClean());
                return vo;
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "读取工作区状态失败");
        }
    }

    /**
     * 读取指定文件的差异（unified diff 文本，HEAD vs 工作区，含已暂存与未暂存改动）。
     */
    @Override
    public String diff(Long id, String path) {
        if (!StringUtils.hasText(path)) {
            throw new BusinessException(ResultCode.PARAM_ERROR, "请指定文件路径");
        }
        try (Repository repo = openRepository(id)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (DiffFormatter fmt = new DiffFormatter(out)) {
                fmt.setRepository(repo);
                fmt.setPathFilter(PathFilter.create(path));
                try (ObjectReader reader = repo.newObjectReader()) {
                    AbstractTreeIterator oldTree = new EmptyTreeIterator();
                    ObjectId head = repo.resolve(Constants.HEAD);
                    if (head != null) {
                        try (RevWalk walk = new RevWalk(repo)) {
                            RevCommit commit = walk.parseCommit(head);
                            CanonicalTreeParser parser = new CanonicalTreeParser();
                            parser.reset(reader, commit.getTree().getId());
                            oldTree = parser;
                        }
                    }
                    AbstractTreeIterator newTree = new FileTreeIterator(repo);
                    fmt.format(oldTree, newTree);
                }
                fmt.flush();
            }
            String text = out.toString(StandardCharsets.UTF_8);
            return StringUtils.hasText(text) ? text : "（该文件没有可显示的差异）";
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("读取文件差异失败, id={}, path={}", id, path, e);
            throw new BusinessException(CodeEnum.RUN_ERR, "读取差异失败");
        }
    }

    /**
     * 暂存文件（git add）。paths 为空时暂存全部变更。
     */
    @Override
    public void stage(Long id, List<String> paths) {
        try (Repository repo = openRepository(id)) {
            try (Git git = new Git(repo)) {
                if (paths == null || paths.isEmpty()) {
                    git.add().addFilepattern(".").call();
                    git.add().setUpdate(true).addFilepattern(".").call();
                } else {
                    AddCommand add = git.add();
                    for (String p : paths) {
                        add.addFilepattern(p);
                    }
                    add.call();
                }
            }
        } catch (Exception e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "暂存失败");
        }
    }

    /**
     * 取消暂存（git reset）。paths 为空时取消全部暂存。
     */
    @Override
    public void unstage(Long id, List<String> paths) {
        try (Repository repo = openRepository(id)) {
            try (Git git = new Git(repo)) {
                ResetCommand reset = git.reset();
                if (paths == null || paths.isEmpty()) {
                    reset.call();
                } else {
                    for (String p : paths) {
                        reset.addPath(p);
                    }
                    reset.call();
                }
            }
        } catch (Exception e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "取消暂存失败");
        }
    }

    /**
     * 提交已暂存的变更（git commit）。
     */
    @Override
    public void commit(Long id, String message) {
        if (!StringUtils.hasText(message)) {
            throw new BusinessException(ResultCode.PARAM_ERROR, "提交信息不能为空");
        }
        try (Repository repo = openRepository(id)) {
            try (Git git = new Git(repo)) {
                git.commit().setMessage(message).call();
            }
        } catch (NoHeadException | NoMessageException e) {
            throw new BusinessException(ResultCode.PARAM_ERROR, e.getMessage());
        } catch (Exception e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "提交失败，可能没有已暂存的修改");
        }
    }

    /**
     * 储藏当前修改（git stash，整体暂存，不支持按路径）。
     */
    @Override
    public void stash(Long id) {
        try (Repository repo = openRepository(id)) {
            try (Git git = new Git(repo)) {
                RevCommit stash = git.stashCreate().call();
                if (stash == null) {
                    throw new BusinessException(CodeEnum.RUN_ERR, "没有可储藏的修改");
                }
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "储藏失败");
        }
    }

    /**
     * 恢复最近一次储藏（git stash pop）。
     */
    @Override
    public void stashPop(Long id) {
        try (Repository repo = openRepository(id)) {
            try (Git git = new Git(repo)) {
                git.stashApply().call();
                git.stashDrop().setStashRef(0).call();
            }
        } catch (Exception e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "恢复储藏失败，可能存在冲突");
        }
    }

    /**
     * 合并分支：将指定源分支合并到当前 HEAD 所在分支。
     */
    @Override
    public void mergeBranch(Long id, String sourceBranch) {
        try (Repository repo = openRepository(id)) {
            try (Git git = new Git(repo)) {
                Ref branchRef = repo.exactRef(Constants.R_HEADS + sourceBranch);
                if (branchRef == null) {
                    throw new BusinessException(ResultCode.NOT_FOUND, "分支不存在");
                }
                MergeResult result = git.merge()
                        .include(branchRef)
                        .call();
                if (result.getMergeStatus() == MergeResult.MergeStatus.CONFLICTING) {
                    throw new BusinessException(CodeEnum.RUN_ERR, "合并冲突，请手动解决");
                }
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "合并失败");
        }
    }

    /**
     * 配置仓库的 user.name / user.email（写入仓库本地配置）。
     */
    @Override
    public void config(Long id, String username, String email) {
        try (Repository repo = openRepository(id)) {
            StoredConfig config = repo.getConfig();
            if (StringUtils.hasText(username)) {
                config.setString("user", null, "name", username);
            }
            if (StringUtils.hasText(email)) {
                config.setString("user", null, "email", email);
            }
            config.save();
        } catch (Exception e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "配置失败");
        }
    }

    /**
     * 推送到仓库登记的远程地址（warehouse.remote_url）。
     */
    @Override
    public void push(Long id) {
        Warehouse warehouse = requireWarehouse(id);
        if (!StringUtils.hasText(warehouse.getRemoteURL())) {
            throw new BusinessException(ResultCode.PARAM_ERROR, "未配置远程仓库地址");
        }
        try (Repository repo = openRepository(id)) {
            try (Git git = new Git(repo)) {
                git.push().setRemote(warehouse.getRemoteURL()).call();
            }
        } catch (Exception e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "推送失败");
        }
    }

    /**
     * 按 id 查询仓库，不存在则抛业务异常。
     */
    private Warehouse requireWarehouse(Long id) {
        Warehouse warehouse = warehouseMapper.selectById(id);
        if (warehouse == null) {
            throw new BusinessException(ResultCode.NOT_FOUND, "仓库不存在");
        }
        return warehouse;
    }

    /**
     * 打开本地 Git 仓库。
     */
    private Repository openRepository(Long id) {
        try {
            return new FileRepositoryBuilder()
                    .findGitDir(new File(requireWarehouse(id).getWarehousePath()))
                    .build();
        } catch (IOException e) {
            throw new BusinessException(CodeEnum.RUN_ERR, "打开仓库失败");
        }
    }

    /**
     * 为每个提交分配泳道（lane）与分支名。
     */
    private void assignLanes(List<CommitNode> nodes, List<Ref> branches, List<RevCommit> branchTips) {
        Map<String, Integer> laneOf = new HashMap<>();
        Map<String, String> branchOf = new HashMap<>();

        int nextLane = 0;
        for (int i = 0; i < branches.size(); i++) {
            String name = Repository.shortenRefName(branches.get(i).getName());
            RevCommit tip = branchTips.get(i);
            if (tip == null || laneOf.containsKey(tip.name())) {
                continue;
            }
            int lane = nextLane++;
            RevCommit c = tip;
            while (c != null && !laneOf.containsKey(c.name())) {
                laneOf.put(c.name(), lane);
                branchOf.put(c.name(), name);
                if (c.getParentCount() == 0) {
                    break;
                }
                c = c.getParent(0);
            }
        }

        List<CommitNode> ordered = new ArrayList<>(nodes);
        Collections.reverse(ordered);
        for (CommitNode node : ordered) {
            if (laneOf.containsKey(node.getFullId())) {
                continue;
            }
            String firstParent = node.getParentIds().isEmpty() ? null : node.getParentIds().get(0);
            Integer parentLane = firstParent != null ? laneOf.get(firstParent) : null;
            boolean parentNamed = firstParent != null && branchOf.containsKey(firstParent);
            if (parentLane != null && !parentNamed) {
                laneOf.put(node.getFullId(), parentLane);
            } else {
                laneOf.put(node.getFullId(), nextLane++);
            }
        }

        for (CommitNode node : nodes) {
            node.setLane(laneOf.getOrDefault(node.getFullId(), 0));
            node.setBranch(branchOf.getOrDefault(node.getFullId(), ""));
        }
    }

    /**
     * 分支排序：main/master 排最前（对应 0 号泳道），其余按名称字典序。
     */
    private void sortBranches(List<Ref> branches) {
        branches.sort((a, b) -> {
            String na = Repository.shortenRefName(a.getName());
            String nb = Repository.shortenRefName(b.getName());
            int ra = isMain(na) ? 0 : 1;
            int rb = isMain(nb) ? 0 : 1;
            if (ra != rb) {
                return Integer.compare(ra, rb);
            }
            return na.compareTo(nb);
        });
    }

    private boolean isMain(String name) {
        return "main".equals(name) || "master".equals(name);
    }

}
