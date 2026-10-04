package org.example.gitvisualization.vo;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 仓库工作区状态（git status 的简化结果）。
 */
@Data
public class GitStatusVo {
    /** 已暂存（staged）的文件 */
    private List<String> staged = new ArrayList<>();
    /** 未暂存的修改（modified，未 tracked 变更） */
    private List<String> modified = new ArrayList<>();
    /** 未暂存的删除（工作区已删除、未提交删除） */
    private List<String> removed = new ArrayList<>();
    /** 未跟踪（untracked）的新文件 */
    private List<String> untracked = new ArrayList<>();
    /** 合并冲突（conflicting）的文件列表，仅在合并产生冲突后非空 */
    private List<String> conflicted = new ArrayList<>();
    /** 工作区是否干净 */
    private boolean clean;
}
