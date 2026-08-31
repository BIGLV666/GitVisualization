package org.example.gitvisualization;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("org.example.gitvisualization.mapper")
public class GitVisualizationApplication {

    public static void main(String[] args) {
        SpringApplication.run(GitVisualizationApplication.class, args);
    }

}
