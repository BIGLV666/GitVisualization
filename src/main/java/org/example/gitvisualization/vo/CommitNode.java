package org.example.gitvisualization.vo;

import lombok.Data;

import java.util.List;

@Data
public class CommitNode {
    /** 7 位短哈希，用于前端节点展示与连线 */
    private String id;
    /** 完整 40 位哈希 */
    private String fullId;
    private String title;
    private String fullMessage;
    private String author;
    /** 是否为当前 HEAD 所在节点 */
    private Boolean isHead;
    /** 父提交完整哈希列表（与 fullId 对应，便于前端连边） */
    private List<String> parentIds;
    /** 提交时间（毫秒时间戳） */
    private Long time;
    /** 所属分支名 */
    private String branch;
    /** 泳道号（0 起，主分支为 0），用于拓扑图纵向排布 */
    private Integer lane;
}
