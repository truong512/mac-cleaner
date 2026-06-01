package service

import (
	"fmt"

	"mac-cleaner/internal/docker"
	"mac-cleaner/internal/insights"
	"mac-cleaner/internal/model"
	"mac-cleaner/internal/timemachine"
)

func (s *Service) GetStorageInsights() []model.StorageInsight {
	return insights.GetStorageInsights(s.catalog)
}

func (s *Service) ListLocalSnapshots(mount string) ([]model.LocalSnapshot, error) {
	return timemachine.ListLocalSnapshots(mount)
}

func (s *Service) DeleteLocalSnapshots(names []string) {
	go s.runDeleteSnapshots(names)
}

func (s *Service) runDeleteSnapshots(names []string) {
	total := len(names)
	if total == 0 {
		s.emit("cleanup:done", model.CleanupReport{DryRun: false})
		return
	}
	report := model.CleanupReport{DryRun: false}
	for i, name := range names {
		s.emitDeleteProgress(model.ScanProgress{
			Phase:       "deleting",
			CurrentPath: name,
			Scanned:     int64(i),
			Total:       int64(total),
			Percent:     float64(i) / float64(total) * 100,
			Message:     fmt.Sprintf("Deleting snapshot %d of %d...", i+1, total),
		})
		err := timemachine.DeleteLocalSnapshot(name)
		if err != nil {
			report.Failed++
			report.Failures = append(report.Failures, model.CleanupFailure{Path: name, Error: err.Error()})
		} else {
			report.Deleted++
			s.deleteSvc.LogAction(name, "timemachine_snapshot", true, nil)
		}
	}
	s.emit("cleanup:done", report)
}

func (s *Service) DockerIsAvailable() bool {
	return docker.IsAvailable()
}

func (s *Service) GetDockerDiskUsage() (model.DockerDiskUsage, error) {
	return docker.DiskUsage()
}

func (s *Service) DockerPrune(opts model.DockerPruneOptions, dryRun bool) {
	go s.runDockerPrune(opts, dryRun)
}

func (s *Service) runDockerPrune(opts model.DockerPruneOptions, dryRun bool) {
	if dryRun {
		usage, err := docker.DiskUsage()
		report := model.CleanupReport{DryRun: true, TotalBytes: docker.TotalReclaimable(usage.Rows)}
		if err != nil {
			report.Failures = []model.CleanupFailure{{Path: "docker", Error: err.Error()}}
		}
		s.emit("cleanup:done", report)
		return
	}
	ctx, cancel := s.deleteCtx()
	defer cancel()
	s.emitDeleteProgress(model.ScanProgress{
		Phase:   "deleting",
		Percent: 0,
		Message: "Running docker prune...",
	})
	out, err := docker.ExecutePrune(ctx, opts)
	if err != nil {
		s.deleteSvc.LogAction(out, "docker_prune", false, err)
		s.emit("cleanup:done", model.CleanupReport{
			DryRun:   false,
			Failed:   1,
			Failures: []model.CleanupFailure{{Path: "docker_prune", Error: err.Error()}},
		})
		return
	}
	s.deleteSvc.LogAction(out, "docker_prune", true, nil)
	s.emit("cleanup:done", model.CleanupReport{DryRun: false, Deleted: 1})
}
